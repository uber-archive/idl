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
var fs = require('fs');
var template = require('string-template');
var mkdirp = require('mkdirp');
var ncp = require('ncp');
var deepEqual = require('deep-equal');

var RemoteCache = require('./remote-cache.js');
var ThriftMetaFile = require('./thrift-meta-file.js');
var gitexec = require('./git-exec.js');
var ServiceName = require('./service-name');
var sha1 = require('./hasher').sha1;
var shasumFiles = require('./hasher').shasumFiles;

var GIT_COMMIT_MESSAGE =
    'Updating {remote} to latest version {sha}';

module.exports = ThriftRepository;

/*  Upstream

    - ./meta.json
    - ./thrift/{team}/{project}.thrift

    meta.json

    {
        version: TimeInMilliSeconds,
        time: ISOString,
        remotes: {
            '{team}/{project}': {
                time: ISOString,
                sha: SHA1OfFile
            }
        }
    }

*/

function ThriftRepository(opts) {
    if (!(this instanceof ThriftRepository)) {
        return new ThriftRepository(opts);
    }

    var self = this;

    self.metaFilename = 'meta.json';
    self.thriftFolderName = 'thrift';
    self.thriftExtension = '.thrift';

    self.remotes = opts.remotes;
    self.upstream = opts.upstream;
    self.repositoryFolder = opts.repositoryFolder;

    self.thriftFolder = path.join(self.repositoryFolder, self.thriftFolderName);
    self.logger = opts.logger;

    self.meta = ThriftMetaFile({
        fileName: path.join(self.repositoryFolder, self.metaFilename)
    });
    self.remoteCache = RemoteCache({
        cacheLocation: opts.cacheLocation,
        logger: self.logger
    });

    self.getServiceName = ServiceName(self.logger);
}

/* rm -rf repoFolder; */
ThriftRepository.prototype.bootstrap =
function bootstrap(callback) {
    var self = this;

    rimraf(self.repositoryFolder, onRemoved);

    function onRemoved(err) {
        if (err) {
            self.logger.error('removing repositoryFolder failed', {
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

        self.fetchRemotes(onRemotes);
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

/* git clone upstream repoFolder */
ThriftRepository.prototype._cloneRepo =
function _cloneRepo(callback) {
    var self = this;

    var cwd = path.dirname(self.repositoryFolder);

    var command = 'git clone ' +
        self.upstream + ' ' +
        self.repositoryFolder;
    gitexec(command, {
        cwd: cwd,
        logger: self.logger,
        ignoreStderr: true
    }, onCloned);

    function onCloned(err, stdout, stderr) {
        if (err) {
            self.logger.error('git clone repoFolder failed', {
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

/*  for each remote {
        RemoteCache.getThriftFile(remote)
    }
*/
ThriftRepository.prototype.fetchRemotes =
function fetchRemotes(callback) {
    var self = this;

    var remotes = self.remotes.slice();
    loop();

    function loop() {
        if (remotes.length === 0) {
            return callback();
        }

        var remote = remotes.shift();
        // self._processThriftFiles(remote, onProcessed);

        self.remoteCache.fetchThriftFile(remote, onThriftFile);

        function onThriftFile(err2, thriftFile) {
            if (err2) {
                self.logger.error('failed to fetch file', {
                    err2: err2,
                    remote: remote
                });
                return callback(err2);
            }

            self._processThriftFile(remote, thriftFile, publishThriftFiles);
        }

        function publishThriftFiles(err2) {
            if (err2) {
                self.logger.error('failed to process thrift file', {
                    err2: err2,
                    remote: remote
                });
                return callback(err2);
            }

            self._processThriftFiles(remote, onProcessed);
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

/*
if (sha(newFile) !== currSha) {
    repo.update(newFile)
    repo.updateMeta()
    repo.commit()
}
*/
ThriftRepository.prototype._processThriftFile =
function _processThriftFile(remote, thriftFile, callback) {
    var self = this;

    var currentSha = self.meta.getSha(remote.folderName);
    var newSha = sha1(thriftFile);

    if (currentSha === newSha) {
        return callback(null);
    }

    var filePath = path.join(self.thriftFolder, remote.fileName);

    mkdirp(path.dirname(filePath), onDirectory);

    function onDirectory(err) {
        if (err) {
            return callback(err);
        }

        fs.writeFile(filePath, thriftFile, onWritten);
    }

    function onWritten(err) {
        if (err) {
            return callback(err);
        }

        self.meta.updateRecord(remote.folderName, {
            sha: newSha
        }, onUpdated);
    }

    function onUpdated(err) {
        if (err) {
            return callback(err);
        }

        var command = 'git add ' +
            self.meta.fileName + ' ' +
            filePath;
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger
        }, onAdded);
    }

    function onAdded(err) {
        if (err) {
            return callback(err);
        }

        // TODO: git tag whenever we update
        var message = template(GIT_COMMIT_MESSAGE, {
            remote: remote.folderName,
            sha: newSha
        });
        var command = 'git commit ' +
            '-m "' + message + '"';
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger
        }, onCommit);
    }

    function onCommit(err) {
        if (err) {
            return callback(err);
        }

        var currTime = self.meta.time();

        var command = 'git tag ' +
            'v' + currTime.getTime() + ' ' +
            '-am "' + currTime.toISOString() + '"';
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger
        }, onTag);
    }

    function onTag(err) {
        if (err) {
            return callback(err);
        }

        var command = 'git push origin master --tags';
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger,
            ignoreStderr: true
        }, callback);
    }
};

ThriftRepository.prototype._processThriftFiles =
function _processThriftFiles(remote, callback) {
    var self = this;
    var source;
    var destination;
    var newShasums;
    var service;

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
        source = path.join(remotePath, self.thriftFolderName, serviceName);
        destination = path.join(self.thriftFolder, serviceName);

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

        ncp(source, destination, onCopied);
    }

    function onCopied(err) {
        if (err) {
            return callback(err);
        }

        self.meta.updateRecord(service, {
            shasums: newShasums
        }, onUpdated);
    }

    function onUpdated(err) {
        if (err) {
            return callback(err);
        }

        var files = Object.keys(newShasums).map(function(filename) {
            return path.join(destination, filename);
        }).join(' ');

        var command = 'git add ' +
            self.meta.fileName + ' ' +
            files;
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger
        }, onAdded);
    }

    function onAdded(err) {
        if (err) {
            return callback(err);
        }

        // TODO: git tag whenever we update
        var message = template('Updating {remote} to latest version', {
            remote: remote.folderName
        });
        var command = 'git commit ' +
            '-m "' + message + '"';
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger
        }, onCommit);
    }

    function onCommit(err) {
        if (err) {
            return callback(err);
        }

        var currTime = self.meta.time();

        var command = 'git tag ' +
            'v' + currTime.getTime() + ' ' +
            '-am "' + currTime.toISOString() + '"';
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger
        }, onTag);
    }

    function onTag(err) {
        if (err) {
            return callback(err);
        }

        var command = 'git push origin master --tags';
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger,
            ignoreStderr: true
        }, callback);
    }
};
