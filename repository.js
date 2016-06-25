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

var rimraf = require('rimraf');
var path = require('path');
var mkdirp = require('mkdirp');
var cpr = require('cpr');
var deepEqual = require('deep-equal');

var RemoteCache = require('./remote-cache.js');
var MetaFile = require('./meta-file.js');
var gitexec = require('./git-process.js').exec;
var ServiceName = require('./service-name');
var shasumFiles = require('./hasher').shasumFiles;
var GitCommands = require('./git-commands');
var common = require('./common');

module.exports = Repository;

function Repository(opts) {
    if (!(this instanceof Repository)) {
        return new Repository(opts);
    }

    var self = this;

    self.metaFilename = 'meta.json';
    self.idlDirectoryName = 'idl';
    self.thriftExtension = '.thrift';

    self.remotes = opts.remotes;
    self.upstream = opts.upstream;
    self.repositoryDirectory = opts.repositoryDirectory;

    self.idlDirectory = path.join(
        self.repositoryDirectory,
        self.idlDirectoryName
    );
    self.logger = opts.logger;

    self.meta = MetaFile({
        fileName: path.join(self.repositoryDirectory, self.metaFilename)
    });
    self.remoteCache = RemoteCache({
        cacheLocation: opts.cacheLocation,
        logger: self.logger
    });

    self.getServiceName = ServiceName(self.logger);
}

/* rm -rf repoDirectory; */
Repository.prototype.bootstrap =
function bootstrap(fetchRemotes, callback) {
    if (typeof fetchRemotes === 'function') {
        callback = fetchRemotes;
        fetchRemotes = true;
    }

    var self = this;

    rimraf(self.repositoryDirectory, onRemoved);

    function onRemoved(err) {
        if (err) {
            self.logger.error('removing repositoryDirectory failed', {
                err: err
            });
            return callback(err);
        }

        self._cloneRepo(onRepoCloned);
    }

    function onRepoCloned(err) {
        if (err) {
            self.logger.error('failed to clone upstream', {
                err: err
            });
            return callback(err);
        }

        if (fetchRemotes) {
            self.fetchRemotes(onRemotes);
        } else {
            callback(null);
        }
    }

    function onRemotes(err) {
        if (err) {
            self.logger.error('fetching remotes failed', {
                err: err
            });
            return callback(err);
        }
        callback(null);
    }
};

/* git clone upstream repoDirectory */
Repository.prototype._cloneRepo =
function _cloneRepo(callback) {
    var self = this;

    var cwd = path.dirname(self.repositoryDirectory);

    var command = 'git clone ' +
        self.upstream + ' ' +
        self.repositoryDirectory;
    gitexec(command, {
        cwd: cwd,
        logger: self.logger,
        ignoreStderr: true
    }, onCloned);

    function onCloned(err, stdout, stderr) {
        if (err) {
            self.logger.error('git clone repoDirectory failed', {
                err: err,
                stderr: stderr,
                upstream: self.upstream
            });
            return callback(err);
        }

        self.meta.readFile(onMetaRead);
    }

    function onMetaRead(err) {
        if (err) {
            self.logger.error('could not load meta.json', {
                err: err,
                upstream: self.upstream
            });

            return callback(err);
        }

        callback(null);
    }
};

Repository.prototype.fetchRemotes =
function fetchRemotes(callback) {
    var self = this;

    var remotes = self.remotes.slice();
    loop();

    function loop() {
        if (remotes.length === 0) {
            return callback();
        }

        var remote = remotes.shift();

        self.remoteCache.update(remote, onUpdateRemoteCache);

        function onUpdateRemoteCache(err2, thriftFile) {
            if (err2) {
                self.logger.error('failed to fetch file', {
                    err2: err2,
                    remote: remote
                });
                return callback(err2);
            }
            self._processIDLFiles(remote, onProcessed);
        }

        function onProcessed(err2) {
            if (err2) {
                self.logger.error('failed to process thrift file', {
                    err2: err2,
                    remote: remote
                });
                return callback(err2);
            }

            loop();
        }
    }
};

Repository.prototype._processIDLFiles =
function _processIDLFiles(remote, callback) {
    var self = this;
    var source;
    var destination;
    var newShasums;
    var service;
    var time = new Date();

    var remotePath = remote.repository.replace('file://', '');
    self.getServiceName(remotePath, onServiceName);

    function onServiceName(err, serviceName) {
        if (err) {
            return callback(err);
        }
        if (!serviceName) {
            return callback(null);
        }

        service = serviceName;
        source = path.join(remotePath, self.idlDirectoryName, serviceName);
        destination = path.join(self.idlDirectory, serviceName);

        shasumFiles(source, onShasums);

    }

    function onShasums(err, shasums) {
        if (err) {
            return callback(err);
        }

        newShasums = shasums;
        var currentShasums = self.meta.getShasums(service);

        if (deepEqual(currentShasums, newShasums)) {
            return callback(null);
        }

        mkdirp(destination, onDirectory);
    }

    function onDirectory(err) {
        if (err) {
            return callback(err);
        }

        cpr(source, destination, {
            deleteFirst: true,
            overwrite: true,
            confirm: true,
            filter: common.fileFilter
        }, onCopied);
    }

    function onCopied(err) {
        if (err) {
            return callback(err);
        }

        self.meta.updateRecord(service, {
            shasums: newShasums,
            time: time
        }, onMetaPublished);
    }

    function onMetaPublished(err) {
        if (err) {
            return callback(err);
        }

        var files = [
            self.meta.fileName
        ].concat(Object.keys(newShasums).map(getFilepath));

        GitCommands.addCommitTagAndPushToOrigin({
            files: files,
            service: remote.directoryName,
            timestamp: self.meta.time(),
            cwd: self.repositoryDirectory,
            logger: self.logger
        }, callback);

        function getFilepath(filename) {
            return path.join(destination, filename);
        }
    }
};
