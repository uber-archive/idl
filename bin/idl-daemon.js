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

var Repository = require('../repository.js');

/*eslint no-process-env: 0*/
var HOME = process.env.HOME;

module.exports = IDLDaemon;

function main() {
    var argv = parseArgs(process.argv.slice(2));
    var idlDaemon = IDLDaemon(argv);
    idlDaemon.on('error', function onRemote(err) {
        console.error('ERR: ', err);
        process.exit(1);
    });
    idlDaemon.bootstrap(function onFini(err) {
        if (err) {
            console.error('ERR: ', err);
            process.exit(1);
        }
    });
}

/*eslint no-console: 0, no-process-exit: 0 */
function IDLDaemon(opts) {
    if (!(this instanceof IDLDaemon)) {
        return new IDLDaemon(opts);
    }

    var self = this;
    EventEmitter.call(self);

    self.opts = opts;
    if (opts.h || opts.help) {
        return self.help();
    }

    self.logger = opts.logger || DebugLogtron('idl');
    self.timers = opts.timers || globalTimers;
    self.configFile = opts['config-file'] || opts.configFile;
    assert(self.configFile, '--config-file is required');

    self.config = null;
    self.idlRepo = null;
    self.timer = null;
}
util.inherits(IDLDaemon, EventEmitter);

IDLDaemon.prototype.bootstrap = function bootstrap(fetchRemotes, cb) {
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

        self.config = IDLDaemonConfig(data);
        self.repo = Repository({
            remotes: self.config.remotes,
            upstream: self.config.upstream,
            repositoryDirectory: self.config.repositoryDirectory,
            cacheLocation: self.config.cacheLocation,
            logger: self.logger
        });

        self.repo.bootstrap(fetchRemotes, onBootstrap);
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

IDLDaemon.prototype.repeat = function repeat() {
    var self = this;

    self.timers.setTimeout(
        fetchRemotes, self.config.fetchInterval
    );

    function fetchRemotes() {
        self.repo.fetchRemotes(onRemote);
    }

    function onRemote(err) {
        if (err) {
            return self.emit('error', err);
        }

        self.emit('fetchedRemotes');
        self.repeat();
    }
};

IDLDaemon.prototype.help = function help() {
    console.log('usage: idl-daemon [--help] [-h]');
    console.log('                    --config-file=<file>');
};

IDLDaemon.prototype.destroy = function destroy() {
    var self = this;

    self.timers.clearTimeout(self.timer);
};

function IDLDaemonConfig(data) {
    if (!(this instanceof IDLDaemonConfig)) {
        return new IDLDaemonConfig(data);
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

    // To determine the repository directory we prefer data.repositoryDirectory,
    // but also support data.repositoryFolder for older versions of idl that
    // used that terminology. Otherwise, create a temporary directory based on
    // the current date.
    self.repositoryDirectory = (
        data.repositoryDirectory ||
        data.repositoryFolder ||
        path.join(os.tmpDir(), 'idl', new Date().toISOString()));
    self.cacheLocation = data.cacheLocation || path.join(
        HOME, '.idl', 'remote-cache'
    );

    self.remotes = [];
    for (var i = 0; i < data.remotes.length; i++) {
        var remote = data.remotes[i];
        self.remotes.push(Remote({
            repository: remote.repository,
            branch: remote.branch,
            strategy: self.fileNameStrategy
        }));
    }
}

function Remote(opts) {
    if (!(this instanceof Remote)) {
        return new Remote(opts);
    }

    var self = this;

    assert(opts.repository, 'opts.repository required');
    assert(opts.strategy, 'opts.strategy required');

    self.repository = opts.repository;
    self.branch = opts.branch || 'master';
    self.directoryName = null;

    var parts;
    if (opts.strategy === 'lastSegment') {
        parts = self.repository.split('/');
        self.directoryName = parts[parts.length - 1];
    // TODO: test lastTwoSegments strategy
    } else if (opts.strategy === 'lastTwoSegments') {
        parts = self.repository.split('/');
        self.directoryName = path.join(
            parts[parts.length - 2],
            parts[parts.length - 1]
        );
    // TODO: test splitOnColon strategy
    } else if (opts.strategy === 'splitOnColon') {
        parts = self.repository.split(':');
        self.directoryName = parts[parts.length - 1];
    }

    self.fileName = self.directoryName + '.thrift';
}

if (require.main === module) {
    main();
}
