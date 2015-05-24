// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var tape = require('tape');
var path = require('path');
var fs = require('fs');
var series = require('run-series');
var parallel = require('run-parallel');
var exec = require('child_process').exec;
var createFixtures = require('fixtures-fs/create-fixtures');
var teardownFixtures = require('fixtures-fs/teardown-fixtures');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');

var wrapCluster = require('./wrap-cluster.js');
var ThriftGod = require('../../bin/thrift-god.js');

var defaultRepos = {
    'A': {
        'thrift': {
            'service.thrift': '' +
                'service A {\n' +
                '   i32 echo(1:i32 value)\n' +
                '}\n'
        }
    },
    'B': {
        'thrift': {
            'service.thrift': '' +
                'service B {\n' +
                '   i32 echo(1:i32 value)\n' +
                '}\n'
        }
    },
    'C': {
        'thrift': {
            'service.thrift': '' +
                'service C {\n' +
                '   i32 echo(1:i32 value)\n' +
                '}\n'
        }
    },
    'D': {
        'thrift': {
            'service.thrift': '' +
                'service D {\n' +
                '   i32 echo(1:i32 value)\n' +
                '}\n'
        }
    }
};

TestCluster.test = wrapCluster(tape, TestCluster);

module.exports = TestCluster;

function TestCluster(opts) {
    if (!(this instanceof TestCluster)) {
        return new TestCluster(opts);
    }

    opts = opts || {};

    var self = this;

    self.remotes = opts.remotes || defaultRepos;
    self.fixturesDir = path.join(__dirname, '..', 'fixtures');
    self.remotesDir = path.join(self.fixturesDir, 'remotes');
    self.upstreamDir = path.join(self.fixturesDir, 'upstream');
    self.repositoryDir = path.join(self.fixturesDir, 'repository');
    self.configFile = path.join(self.fixturesDir, 'config.json');

    self.config = opts.config || {};
    if (!self.config.upstream) {
        self.config.upstream = 'file://' + self.upstreamDir;
    }
    if (!self.config.remotes) {
        var keys = Object.keys(self.remotes);
        self.config.remotes = [];
        for (var i = 0; i < keys.length; i++) {
            self.config.remotes[i] = 'file://' + path.join(
                self.remotesDir, keys[i]
            );
        }
    }
    if (!self.config.repositoryFolder) {
        self.config.repositoryFolder = self.repositoryDir;
    }

    self.thriftGod = null;
}

TestCluster.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    series([
        rimraf.bind(null, self.fixturesDir),
        mkdirp.bind(null, self.remotesDir),
        createFixtures.bind(
            null, self.remotesDir, self.remotes
        ),
        self.gitify.bind(self),
        self.setupUpstream.bind(self),
        self.writeConfigFile.bind(self),
        self.setupThriftGod.bind(self)
    ], cb);
};

// git init
// git a .
// git commit -m 'initial'
TestCluster.prototype.gitify = function gitify(cb) {
    var self = this;

    var keys = Object.keys(self.remotes);
    var tasks = keys.map(function buildThunk(remoteKey) {
        var cwd = path.join(self.remotesDir, remoteKey);

        return function thunk(callback) {
            series([
                exec.bind(null, 'git init', {
                    cwd: cwd
                }),
                exec.bind(null, 'git add --all .', {
                    cwd: cwd
                }),
                exec.bind(null, 'git commit -am "initial"', {
                    cwd: cwd
                })
            ], callback);
        };
    });

    return parallel(tasks, cb);
};

TestCluster.prototype.setupUpstream = function setupUpstream(cb) {
    var self = this;

    series([
        mkdirp.bind(null, self.upstreamDir),
        exec.bind(null, 'git init', {
            cwd: self.upstreamDir
        }),
        exec.bind(null, 'git add --all', {
            cwd: self.upstreamDir
        }),
        exec.bind(null, 'git commit --allow-empty -am "initial"', {
            cwd: self.upstreamDir
        })
    ], cb);
};

TestCluster.prototype.writeConfigFile =
function writeConfigFile(cb) {
    var self = this;

    var data = JSON.stringify(self.config, null, '    ');
    fs.writeFile(self.configFile, data, 'utf8', cb);
};

TestCluster.prototype.setupThriftGod =
function setupThriftGod(cb) {
    var self = this;

    self.thriftGod = ThriftGod({
        configFile: self.configFile
    });
    self.thriftGod.bootstrap(cb);
};

TestCluster.prototype.destroy = function destroy(cb) {
    var self = this;

    rimraf(self.fixturesDir, cb);
};
