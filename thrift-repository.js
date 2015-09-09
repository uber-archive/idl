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
var gitexec = require('./git-process.js').exec;
var ServiceName = require('./service-name');
var sha1 = require('./hasher').sha1;
var shasumFiles = require('./hasher').shasumFiles;
var GitCommands = require('./git-commands');

module.exports = ThriftRepository;

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
function bootstrap(fetchRemotes, callback) {
    if (typeof fetchRemotes === 'function') {
        callback = fetchRemotes;
        fetchRemotes = true;
    }

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

        self.remoteCache.update(remote, onUpdateRemoteCache);

        function onUpdateRemoteCache(err2, thriftFile) {
            if (err2) {
                self.logger.error('failed to fetch file', {
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

ThriftRepository.prototype._processThriftFiles =
function _processThriftFiles(remote, callback) {
    var self = this;
    var source;
    var destination;
    var newShasums;
    var service;
    var publishedMetaFile;
    var destinationMetaFilepath;
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
            shasums: newShasums,
            time: time
        }, onRegistryMetaUpdated);
    }

    function onRegistryMetaUpdated(err) {
        if (err) {
            return callback(err);
        }
        publishedMetaFile = ThriftMetaFile({
            fileName: path.join(
                remotePath,
                self.thriftFolderName,
                self.metaFilename
            )
        });

        publishedMetaFile.readFile(onFileRead);

        function onFileRead(readErr) {
            if (readErr) {
                return callback(readErr);
            }
            publishedMetaFile.publish({
                shasums: newShasums,
                time: time
            }, onPublishedMetaFileWritten);
        }
    }

    function onPublishedMetaFileWritten(err) {
        if (err) {
            return callback(err);
        }

        fs.readFile(publishedMetaFile.fileName, 'utf8', onPublishedRead);

        function onPublishedRead(err2, content) {
            if (err2) {
                return callback(err2);
            }

            destinationMetaFilepath = path.join(
                destination,
                self.metaFilename
            );

            fs.writeFile(
                destinationMetaFilepath,
                content,
                'utf8',
                onMetaPublished
            );
        }
    }

    function onMetaPublished(err) {
        if (err) {
            return callback(err);
        }

        var files = [
            self.meta.fileName,
            destinationMetaFilepath
        ].concat(Object.keys(newShasums).map(getFilepath));

        GitCommands.addCommitTagAndPushToOrigin({
            files: files,
            service: remote.folderName,
            timestamp: self.meta.time(),
            cwd: self.repositoryFolder,
            logger: self.logger
        }, callback);

        function getFilepath(filename) {
            return path.join(destination, filename);
        }
    }
};
