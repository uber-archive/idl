'use strict';

var readJSON = require('read-json');
var fs = require('fs');

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

ThriftMetaFile.prototype.updateRecord =
function updateRecord(folderName, opts, callback) {
    var self = this;

    var newDate = opts.time ? new Date(opts.time) : new Date();
    if (+newDate > +self._lastDate) {
        self._lastDate = newDate;
    }

    self._remotes[folderName] = {
        time: self._lastDate.toISOString(),
        sha: opts.sha
    };

    self._writeFile(callback);
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
