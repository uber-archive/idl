#!/usr/bin/env node

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
var globalTimers = require('timers');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var ThriftRepository = require('../thrift-repository.js');

/*eslint no-process-env: 0*/
var HOME = process.env.HOME;

module.exports = ThriftGod;

function main() {
    var argv = parseArgs(process.argv.slice(2));
    var thriftGod = ThriftGod(argv);
    thriftGod.on('error', function onRemote(err) {
        console.error('ERR: ', err);
        process.exit(1);
    });
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
    EventEmitter.call(self);

    self.opts = opts;
    if (opts.h || opts.help) {
        return self.help();
    }

    self.logger = opts.logger || DebugLogtron('thriftstore');
    self.timers = opts.timers || globalTimers;
    self.configFile = opts['config-file'] || opts.configFile;
    assert(self.configFile, '--config-file is required');

    self.config = null;
    self.thriftRepo = null;
    self.timer = null;
}
util.inherits(ThriftGod, EventEmitter);

ThriftGod.prototype.bootstrap = function bootstrap(fetchRemotes, cb) {
    if (typeof fetchRemotes === 'function') {
        cb = fetchRemotes;
        fetchRemotes = true;
    }

    var self = this;

    // TODO reload json file when it changes
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

        self.thriftRepo.bootstrap(fetchRemotes, onBootstrap);
    }

    function onBootstrap(err) {
        if (err) {
            return cb(err);
        }

        self.emit('fetchedRemotes');
        self.repeat();
        cb(null);
    }
};

ThriftGod.prototype.repeat = function repeat() {
    var self = this;

    self.timers.setTimeout(
        fetchRemotes, self.config.fetchInterval
    );

    function fetchRemotes() {
        self.thriftRepo.fetchRemotes(onRemote);
    }

    function onRemote(err) {
        if (err) {
            return self.emit('error', err);
        }

        self.emit('fetchedRemotes');
        self.repeat();
    }
};

ThriftGod.prototype.help = function help() {
    console.log('usage: thrift-store [--help] [-h]');
    console.log('                    --config-file=<file>');
};

ThriftGod.prototype.destroy = function destroy() {
    var self = this;

    self.timers.clearTimeout(self.timer);
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
    assert(data.fetchInterval &&
        typeof data.fetchInterval === 'number',
        'must configure fetchInterval');

    self.fileNameStrategy = data.fileNameStrategy;
    self.upstream = data.upstream;
    self.fetchInterval = data.fetchInterval;

    self.repositoryFolder = data.repositoryFolder || path.join(
        os.tmpDir(), 'thrift-store', new Date().toISOString()
    );
    self.cacheLocation = data.cacheLocation || path.join(
        HOME, '.thrift-store', 'remote-cache'
    );

    self.remotes = [];
    for (var i = 0; i < data.remotes.length; i++) {
        var remote = data.remotes[i];
        self.remotes.push(ThriftRemote({
            repository: remote.repository,
            branch: remote.branch,
            localFileName: remote.localFileName,
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
    self.branch = opts.branch || 'master';
    self.localFileName = opts.localFileName ||
        'thrift/service.thrift';
    self.folderName = null;

    var parts;
    if (opts.strategy === 'lastSegment') {
        parts = self.repository.split('/');
        self.folderName = parts[parts.length - 1];
    // TODO: test lastTwoSegments strategy
    } else if (opts.strategy === 'lastTwoSegments') {
        parts = self.repository.split('/');
        self.folderName = path.join(
            parts[parts.length - 2],
            parts[parts.length - 1]
        );
    // TODO: test splitOnColon strategy
    } else if (opts.strategy === 'splitOnColon') {
        parts = self.repository.split(':');
        self.folderName = parts[parts.length - 1];
    }

    self.fileName = self.folderName + '.thrift';
}

if (require.main === module) {
    main();
}
