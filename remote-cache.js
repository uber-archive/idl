'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

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

    var command = 'git clone ' +
        '--no-checkout ' +
        '--branch ' + remote.branch + ' ' +
        '--depth 1 ' +
        remote.repository + ' ' +
        remote.folderName;
    gitexec(command, {
        cwd: self.cacheLocation,
        logger: self.logger,
        ignoreStderr: true
    }, callback);
};

RemoteCache.prototype._pullAndUpdate =
function _pullAndUpdate(remote, callback) {
    var self = this;
    var cwd = path.join(self.cacheLocation, remote.folderName);

    // TODO: do an efficient fetch
    // var command = 'git fetch ' +
    //     '--depth 1 ' +
    //     'origin ' +
    //     remote.branch;
    var command = 'git fetch --all';
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
        }, callback);
    }
};
