'use strict';

var readJSON = require('read-json');
var fs = require('fs');
var setImmediate = require('timers').setImmediate;

module.exports = ThriftMetaFile;

function ThriftMetaFile(opts) {
    if (!(this instanceof ThriftMetaFile)) {
        return new ThriftMetaFile(opts);
    }

    var self = this;

    self.fileName = opts.fileName;

    self._lastDate = null;
    self._remotes = null;
}

ThriftMetaFile.prototype.readFile = function readFile(cb) {
    var self = this;

    readJSON(self.fileName, onFile);

    function onFile(err, meta) {
        if (err && err.code === 'ENOENT') {
            self._remotes = {};
            return cb(null);
        } else if (err) {
            return cb(err);
        }

        self._remotes = meta.remotes;
        cb(null);
    }
};

ThriftMetaFile.prototype.getSha = function getSha(folderName) {
    var self = this;

    var remote = self._remotes[folderName];
    if (!remote) {
        return null;
    }

    return remote.sha;
};

ThriftMetaFile.prototype.getShasums = function getShasums(folderName) {
    var self = this;

    var remote = self._remotes[folderName];
    if (!remote) {
        return null;
    }

    return remote.shasums;
};

ThriftMetaFile.prototype.updateRecord =
function updateRecord(folderName, opts, callback) {
    var self = this;

    var newDate = opts.time ? new Date(opts.time) : new Date();
    if (+newDate > +self._lastDate) {
        self._lastDate = newDate;
    }

    self._remotes[folderName] = {
        time: self._lastDate.toISOString(),
        sha: opts.sha,
        shasums: opts.shasums
    };

    self._writeFile(callback);
};

// a lock should be set that delays this if updateRecord is in progress
ThriftMetaFile.prototype.getDependencies =
function getDependencies(callback) {
    var self = this;

    setImmediate(onNextTick);

    function onNextTick() {
        callback(null, self._remotes);
    }
};

ThriftMetaFile.prototype._writeFile = function _writeFile(callback) {
    var self = this;

    var date = self._lastDate;

    var newContent = JSON.stringify({
        version: date.getTime(),
        time: date.toISOString(),
        remotes: self._remotes
    }, null, '    ') + '\n';

    fs.writeFile(self.fileName, newContent, 'utf8', callback);
};

ThriftMetaFile.prototype.time = function time() {
    var self = this;

    return self._lastDate;
};
