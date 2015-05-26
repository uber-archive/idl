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

var parseArgs = require('minimist');
var process = require('process');
var assert = require('assert');
var readJSON = require('read-json');
var console = require('console');
var path = require('path');
var os = require('os');
var DebugLogtron = require('debug-logtron');

var ThriftRepository = require('../thrift-repository.js');

/*eslint no-process-env: 0*/
var HOME = process.env.HOME;

module.exports = ThriftGod;

if (require.main === module) {
    var argv = parseArgs(process.argv.slice(2));
    var thriftGod = ThriftGod(argv);
    thriftGod.bootstrap(function onFini(err) {
        if (err) {
            console.error('ERR: ', err);
            process.exit(1);
        }
    });
}

/*eslint no-console: 0, no-process-exit: 0 */
function ThriftGod(opts) {
    if (!(this instanceof ThriftGod)) {
        return new ThriftGod(opts);
    }

    var self = this;

    self.opts = opts;
    if (opts.h || opts.help) {
        return self.help();
    }

    self.logger = opts.logger || DebugLogtron('thriftgod');
    self.configFile = opts['config-file'] || opts.configFile;
    assert(self.configFile, '--config-file is required');

    self.config = null;
    self.thriftRepo = null;
}

ThriftGod.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    readJSON(self.configFile, onConfig);

    function onConfig(err, data) {
        if (err) {
            return cb(err);
        }

        self.config = ThriftGodConfig(data);
        self.thriftRepo = ThriftRepository({
            remotes: self.config.remotes,
            upstream: self.config.upstream,
            repositoryFolder: self.config.repositoryFolder,
            cacheLocation: self.config.cacheLocation,
            logger: self.logger
        });

        self.thriftRepo.bootstrap(onBootstrap);
    }

    function onBootstrap(err) {
        if (err) {
            return cb(err);
        }

        /* TODO: run cron ? */
        cb(null);
    }
};

ThriftGod.prototype.help = function help() {
    console.log('usage: thrift-god [--help] [-h]');
    console.log('                  --config-file=<file>');
};

function ThriftGodConfig(data) {
    if (!(this instanceof ThriftGodConfig)) {
        return new ThriftGodConfig(data);
    }

    var self = this;

    assert(typeof data === 'object' && data,
        'config file must be a json object');
    assert(data.remotes && Array.isArray(data.remotes),
        'must configure `remotes`');
    assert(data.upstream && typeof data.upstream === 'string',
        'must configure `upstream`');
    assert(data.fileNameStrategy &&
        typeof data.fileNameStrategy === 'string',
        'must configure fileNameStrategy');

    self.fileNameStrategy = data.fileNameStrategy;
    self.upstream = data.upstream;

    self.repositoryFolder = data.repositoryFolder || path.join(
        os.tmpDir(), 'thrift-god', new Date().toISOString()
    );
    self.cacheLocation = data.cacheLocation || path.join(
        HOME, '.thrift-god', 'remote-cache'
    );

    self.remotes = [];
    for (var i = 0; i < data.remotes.length; i++) {
        var remote = data.remotes[i];
        self.remotes.push(ThriftRemote({
            repository: remote.repository,
            branch: remote.branch,
            strategy: self.fileNameStrategy
        }));
    }
}

function ThriftRemote(opts) {
    if (!(this instanceof ThriftRemote)) {
        return new ThriftRemote(opts);
    }

    var self = this;

    assert(opts.repository, 'opts.repository required');
    assert(opts.strategy, 'opts.strategy required');

    self.repository = opts.repository;
    // TODO handle branches
    self.branch = opts.branch || 'master';
    // TODO handle localFileName
    self.localFileName = opts.localFileName ||
        'thrift/service.thrift';
    self.folderName = null;

    var parts;
    if (opts.strategy === 'lastSegment') {
        parts = self.repository.split('/');
        self.folderName = parts[parts.length - 1];
    } else if (opts.strategy === 'lastTwoSegments') {
        parts = self.repository.split('/');
        self.folderName = path.join(
            parts[parts.length - 2],
            parts[parts.length - 1]
        );
    } else if (opts.strategy === 'splitOnColon') {
        parts = self.repository.split(':');
        self.folderName = parts[parts.length - 1];
    }

    self.fileName = self.folderName + '.thrift';

}
