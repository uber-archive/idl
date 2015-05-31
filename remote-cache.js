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

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

var gitexec = require('./git-exec.js');

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
RemoteCache.prototype.fetchThriftFile =
function fetchThriftFile(remote, callback) {
    var self = this;

    if (self.cacheDirExists) {
        checkRemoteFolder();
    } else {
        mkdirp(self.cacheLocation, onCacheLocationMade);
    }

    function onCacheLocationMade(err) {
        if (err) {
            return callback(err);
        }

        self.cacheDirExists = true;
        checkRemoteFolder();
    }

    function checkRemoteFolder() {
        var folder = path.join(self.cacheLocation, remote.folderName);
        fs.exists(folder, onExists);
    }

    function onExists(exists) {
        if (!exists) {
            self._initialLoad(remote, callback);
        } else {
            self._pullAndUpdate(remote, callback);
        }
    }
};

// git clone --no-checkout --depth 1 remote folderName
RemoteCache.prototype._initialLoad =
function _initialLoad(remote, callback) {
    var self = this;

    var cwd = self.cacheLocation;

    var command = 'git clone ' +
        '--no-checkout ' +
        '--branch ' + remote.branch + ' ' +
        '--depth 1 ' +
        remote.repository + ' ' +
        remote.folderName;
    gitexec(command, {
        cwd: cwd,
        logger: self.logger,
        ignoreStderr: true
    }, onCloned);

    function onCloned(err, stdout, stderr) {
        if (err) {
            self.logger.error('git clone remote failed', {
                err: err,
                stderr: stderr,
                remote: remote
            });
            return callback(err);
        }

        self._showThriftFile(remote, callback);
    }
};

RemoteCache.prototype._pullAndUpdate =
function _pullAndUpdate(remote, callback) {
    var self = this;

    var cwd = path.join(self.cacheLocation, remote.folderName);

    var command = 'git fetch ' +
        '--depth 1 ' +
        'origin ' +
        remote.branch;
    gitexec(command, {
        cwd: cwd,
        logger: self.logger,
        ignoreStderr: true
    }, onUpdated);

    function onUpdated(err, stdout, stderr) {
        if (err) {
            self.logger.error('git fetch remote failed', {
                err: err,
                stderr: stderr,
                cwd: cwd,
                remote: remote
            });
            return callback(err);
        }

        var command2 = 'git reset ' +
            '--hard ' +
            'origin/' + remote.branch;
        gitexec(command2, {
            cwd: cwd,
            logger: self.logger
        }, onMerged);
    }

    function onMerged(err, stdout, stderr) {
        if (err) {
            self.logger.error('git merge remote failed', {
                err: err,
                stderr: stderr,
                cwd: cwd,
                remote: remote
            });
            return callback(err);
        }

        self._showThriftFile(remote, callback);
    }
};

// git show HEAD:thrift/service.thrift
RemoteCache.prototype._showThriftFile =
function _showThriftFile(remote, callback) {
    var self = this;

    var cwd = path.join(self.cacheLocation, remote.folderName);

    var command = 'git show HEAD:' + remote.localFileName;
    gitexec(command, {
        cwd: cwd,
        logger: self.logger
    }, onGitShow);

    function onGitShow(err, stdout, stderr) {
        if (err) {
            self.logger.warn('git show thrift file failed', {
                err: err,
                stderr: stderr,
                remote: remote
            });
            return callback(null, '');
        }

        callback(null, String(stdout));
    }
};
