'use strict';

var rimraf = require('rimraf');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var template = require('string-template');
var mkdirp = require('mkdirp');

var RemoteCache = require('./remote-cache.js');
var ThriftMetaFile = require('./thrift-meta-file.js');
var gitexec = require('./git-exec.js');

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

    self.remotes = opts.remotes;
    self.upstream = opts.upstream;
    self.repositoryFolder = opts.repositoryFolder;
    self.thriftFolder = path.join(self.repositoryFolder, 'thrift');
    self.logger = opts.logger;

    self.meta = ThriftMetaFile({
        fileName: path.join(self.repositoryFolder, 'meta.json')
    });
    self.remoteCache = RemoteCache({
        cacheLocation: opts.cacheLocation,
        logger: self.logger
    });
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

        self._cloneRepo(callback);
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

        self._fetchRemotes(onRemotes);
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

/*  for each remote {
        RemoteCache.getThriftFile(remote)
    }
*/
ThriftRepository.prototype._fetchRemotes =
function _fetchRemotes(callback) {
    var self = this;

    var remotes = self.remotes.slice();
    loop();

    function loop() {
        if (remotes.length === 0) {
            return callback();
        }

        var remote = remotes.shift();
        self.remoteCache.fetchThriftFile(remote, onThriftFile);

        function onThriftFile(err2, thriftFile) {
            if (err2) {
                self.logger.error('failed to fetch file', {
                    err2: err2,
                    remote: remote
                });
                return callback(err2);
            }

            self._processThriftFile(remote, thriftFile, onProcessed);
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

        self.meta.updateRecord(remote.folderName, newSha, onUpdated);
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

        var command = 'git push origin master';
        gitexec(command, {
            cwd: self.repositoryFolder,
            logger: self.logger,
            ignoreStderr: true
        }, callback);
    }
};

function sha1(content) {
    var hash = crypto.createHash('sha1');
    hash.update(content);
    return hash.digest('hex');
}
