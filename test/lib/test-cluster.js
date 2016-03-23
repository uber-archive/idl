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
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var wrapCluster = require('tape-cluster');
var extend = require('xtend');
var DebugLogtron = require('debug-logtron');
var TimeMock = require('time-mock');
var readDirFiles = require('read-dir-files').read;

var IDLDaemon = require('../../bin/idl-daemon');
var IDL = require('../../bin/idl');
var defineFixture = require('./define-fixture');

var defaultRepos = ['A', 'B', 'C', 'D'].reduce(makeFixture, {});

function makeFixture(memo, letter) {
    memo[letter] = defineFixture({
        name: letter
    });
    return memo;
}

TestCluster.test = wrapCluster(tape, TestCluster);

module.exports = TestCluster;

function TestCluster(opts) {
    if (!(this instanceof TestCluster)) {
        return new TestCluster(opts);
    }

    opts = opts || {};

    var self = this;

    self.remoteRepos = extend(defaultRepos, opts.remoteRepos || {});
    self.repoFixtures = Object.keys(self.remoteRepos)
        .reduce(function getFiles(acc, name) {
            acc[name] = self.remoteRepos[name].files;
            return acc;
        }, {});

    self.prepareOnly = opts.prepareOnly || false;
    self.fetchRemotes = opts.fetchRemotes === false ? false : true;

    self.fixturesDir = path.join(__dirname, '..', 'fixtures');
    self.remotesDir = path.join(self.fixturesDir, 'remotes');
    self.upstreamDir = path.join(self.fixturesDir, 'upstream');
    self.repositoryDir = path.join(self.fixturesDir, 'repository');
    self.configFile = path.join(self.fixturesDir, 'config.json');
    self.cacheDir = path.join(self.fixturesDir, 'remote-cache');
    self.getCacheDir = path.join(self.fixturesDir, 'upstream-cache');
    self.localApp = path.join(self.fixturesDir, 'local-app');

    self.config = extend({
        upstream: 'file://' + self.upstreamDir,
        repositoryDirectory: self.repositoryDir,
        fileNameStrategy: 'lastSegment',
        cacheLocation: self.cacheDir,
        fetchInterval: opts.fetchInterval || 30 * 1000,
        remotes: Object.keys(self.remoteRepos)
            .map(function buildRepoObj(remoteName) {
                var repoInfo = self.remoteRepos[remoteName];

                return {
                    repository: 'file://' + path.join(
                        self.remotesDir, remoteName
                    ),
                    branch: repoInfo.branch || 'master',
                    localFileName: repoInfo.localFileName
                };
            })
    }, opts.config || {});

    self.logger = DebugLogtron('idl');
    self.timers = TimeMock(0);
    self.idlDaemon = null;
}

TestCluster.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    series([
        rimraf.bind(null, self.fixturesDir),
        mkdirp.bind(null, self.remotesDir),
        createFixtures.bind(null, self.remotesDir, self.repoFixtures),
        createFixtures.bind(null, self.localApp, {}),
        self.gitifyRemotes.bind(self),
        self.setupUpstream.bind(self),
        self.writeConfigFile.bind(self),
        self.prepareOnly ? null : self.setupIDLDaemon.bind(self)
    ].filter(Boolean), cb);
};

// git init
// git a .
// git commit -m 'initial'
TestCluster.prototype.gitifyRemotes = function gitifyRemotes(cb) {
    var self = this;

    var keys = Object.keys(self.remoteRepos);
    var tasks = keys.map(function buildThunk(remoteKey) {
        var repoInfo = self.remoteRepos[remoteKey];
        var cwd = path.join(self.remotesDir, remoteKey);
        return makeGitifyThunk(cwd, repoInfo);
    });

    return parallel(tasks, cb);
};

function makeGitifyThunk(cwd, repoInfo) {
    return function gitifyThunk(callback) {
        var gitOpts = {
            cwd: cwd
        };
        series([
            git('init', gitOpts),
            git('remote add origin ' + repoInfo.gitUrl, gitOpts),
            git('commit --allow-empty -am "initial"', gitOpts),
            repoInfo.branch !== 'master' ?
                git('checkout -b ' + repoInfo.branch, gitOpts) : null,
            git('add --all .', gitOpts),
            git('commit -am "second"', gitOpts)
        ].filter(Boolean), callback);
    };
}

TestCluster.prototype.updateRemote =
function updateRemote(name, files, callback) {
    var self = this;

    var remoteDir = path.join(self.remotesDir, name);

    series([
        rimraf.bind(null, path.join(remoteDir, 'idl')),
        createFixtures.bind(null, remoteDir, files),
        git('add --all .', {
            cwd: remoteDir
        }),
        git('commit -am "update files"', {
            cwd: remoteDir
        })
    ], callback);
};

TestCluster.prototype.setupUpstream = function setupUpstream(cb) {
    var self = this;

    series([
        mkdirp.bind(null, self.upstreamDir),
        git('init', {
            cwd: self.upstreamDir
        }),
        git('commit --allow-empty -am "initial"', {
            cwd: self.upstreamDir
        }),
        git('config --bool core.bare true', {
            cwd: self.upstreamDir
        })
    ], cb);
};

TestCluster.prototype.writeConfigFile = function writeConfigFile(cb) {
    var self = this;

    var data = JSON.stringify(self.config, null, '    ') + '\n';
    fs.writeFile(self.configFile, data, 'utf8', cb);
};

TestCluster.prototype.setupIDLDaemon = function setupIDLDaemon(cb) {
    var self = this;

    if (self.idlDaemon) {
        self.idlDaemon.destroy();
    }

    self.idlDaemon = IDLDaemon({
        configFile: self.configFile,
        logger: self.logger,
        timers: self.timers
    });
    self.idlDaemon.bootstrap(self.fetchRemotes, cb);
};

TestCluster.prototype.gitlog = function gitlog(cb) {
    var self = this;

    var command = 'git log --pretty="%s"';
    exec(command, {
        cwd: self.upstreamDir
    }, cb);
};

TestCluster.prototype.gitshow = function gitshow(file, cb) {
    var self = this;

    var command = 'git show HEAD:' + file;
    exec(command, {
        cwd: self.upstreamDir
    }, cb);
};

TestCluster.prototype.gittag = function gittag(cb) {
    var self = this;

    var command = 'git tag --list';
    exec(command, {
        cwd: self.upstreamDir
    }, cb);
};

TestCluster.prototype.gitlsfiles = function gitlsfiles(cb) {
    var self = this;

    var command = 'git ls-tree --full-tree -r HEAD';
    exec(command, {
        cwd: self.upstreamDir
    }, onlsfiles);

    function onlsfiles(err, stdout, stderr) {
        if (err) {
            return cb(err);
        }

        var files = stdout.trim().split('\n').map(parseFilepaths);
        cb(null, files);
    }

    function parseFilepaths(file) {
        return file.split(/\s/)[3];
    }
};

TestCluster.prototype.inspectUpstream =
function inspectUpstream(callback) {
    var self = this;

    parallel({
        gitlog: self.gitlog.bind(self),
        gittag: self.gittag.bind(self),
        gitlsfiles: self.gitlsfiles.bind(self),
        meta: function thunk(cb) {
            self.gitshow('meta.json', onFile);

            function onFile(err, file) {
                if (err) {
                    return cb(err);
                }

                cb(null, JSON.parse(file));
            }
        }
    }, readFiles);

    function readFiles(err, results) {
        if (err) {
            return callback(err);
        }

        var fileTasks = results.gitlsfiles.reduce(function b(acc, file) {
            acc[file] = self.gitshow.bind(self, file);
            return acc;
        }, {});

        parallel(fileTasks, function onFiles(readFilesErr, files) {
            if (readFilesErr) {
                return callback(readFilesErr);
            }

            results.files = files;

            callback(null, results);
        });
    }
};

TestCluster.prototype.inspectLocalApp =
function inspectLocalApp(callback) {
    var self = this;

    readDirFiles(self.localApp, 'utf8', callback);
};

TestCluster.prototype.idlGet = function idlGet(text, cb) {
    var self = this;

    text = text + ' --repository=' + 'file://' + self.upstreamDir;
    text = text + ' --cacheDir=' + self.getCacheDir;
    text = text + ' --cwd=' + self.localApp;

    return IDL.exec(text, {
        preauth: 'true',
        logger: self.logger,
        timers: self.timers
    }, cb);
};

TestCluster.prototype.idlFetch = function idlFetch(moduleName, cb) {
    var self = this;
    var text = 'fetch ' + moduleName;

    text = text + ' --repository=' + 'file://' + self.upstreamDir;
    text = text + ' --cacheDir=' + self.getCacheDir;
    text = text + ' --cwd=' + self.localApp;

    return IDL.exec(text, {
        preauth: 'true',
        logger: self.logger,
        timers: self.timers
    }, cb);
};

TestCluster.prototype.idlPublish = function idlPublish(cwd, cb) {
    var self = this;
    var text = 'publish';

    text = text + ' --repository=' + 'file://' + self.upstreamDir;
    text = text + ' --cacheDir=' + self.getCacheDir;
    text = text + ' --cwd=' + cwd;

    return IDL.exec(text, {
        preauth: 'true',
        logger: self.logger,
        timers: self.timers
    }, cb);
};

TestCluster.prototype.idlUpdate = function idlUpdate(cb) {
    var self = this;
    var text = 'update';

    text = text + ' --repository=' + 'file://' + self.upstreamDir;
    text = text + ' --cacheDir=' + self.getCacheDir;
    text = text + ' --cwd=' + self.localApp;

    return IDL.exec(text, {
        preauth: 'true',
        logger: self.logger,
        timers: self.timers
    }, cb);
};

TestCluster.prototype.close = function close(cb) {
    var self = this;

    self.idlDaemon.destroy();
    rimraf(self.fixturesDir, cb);
};

function git(text, opts) {
    return exec.bind(null, 'git ' + text, opts);
}
