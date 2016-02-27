// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var series = require('run-series');

var gitexec = require('./git-process.js').exec;

module.exports = RemoteCache;

function RemoteCache(opts) {
    if (!(this instanceof RemoteCache)) {
        return new RemoteCache(opts);
    }

    var self = this;

    self.cacheLocation = opts.cacheLocation;
    self.logger = opts.logger;

    self.cacheDirExists = false;
}

/*
    if not cacheLocation/{remoteName} {
        initialLoad()
    } else {
        pullAndUpdate()
    }
*/
RemoteCache.prototype.update =
function update(remote, callback) {
    var self = this;

    if (self.cacheDirExists) {
        checkRemoteDirectory();
    } else {
        mkdirp(self.cacheLocation, onCacheLocationMade);
    }

    function onCacheLocationMade(err) {
        if (err) {
            return callback(err);
        }

        self.cacheDirExists = true;
        checkRemoteDirectory();
    }

    function checkRemoteDirectory() {
        var directory = path.join(self.cacheLocation, remote.directoryName);
        fs.exists(directory, onExists);
    }

    function onExists(exists) {
        if (!exists) {
            self._initialLoad(remote, callback);
        } else {
            self._pullAndUpdate(remote, callback);
        }
    }
};

// git clone --no-checkout --depth 1 remote directoryName
RemoteCache.prototype._initialLoad =
function _initialLoad(remote, callback) {
    var self = this;

    var command = 'git clone ' +
        '--no-checkout ' +
        '--branch ' + remote.branch + ' ' +
        '--depth 1 ' +
        remote.repository + ' ' +
        remote.directoryName;
    gitexec(command, {
        cwd: self.cacheLocation,
        logger: self.logger,
        ignoreStderr: true
    }, callback);
};

RemoteCache.prototype._pullAndUpdate =
function _pullAndUpdate(remote, callback) {
    var self = this;

    var cwd = path.join(self.cacheLocation, remote.directoryName);

    series([
        // TODO: do an efficient fetch
        // 'git fetch --depth 1 origin ' + remote.branch;
        gitCommandThunk('git fetch --all', true),
        gitCommandThunk('git reset --hard origin/' + remote.branch, true),
        gitCommandThunk('git clean -fd', true)
    ], callback);

    function gitCommandThunk(command, ignoreStderr) {
        return function git(cb) {
            gitexec(command, {
                cwd: cwd,
                logger: self.logger,
                ignoreStderr: ignoreStderr
            }, cb);
        };
    }
};
