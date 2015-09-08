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
    self._version = null;
    self._shasums = null;
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
        self._version = meta.version;
        self._lastDate = new Date(meta.time);
        self._shasums = meta.shasums;

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

ThriftMetaFile.prototype._updateVersion = function version(opts) {
    opts = opts || {};
    var self = this;
    var newDate = opts.time ? new Date(opts.time) : new Date();
    if (+newDate > +self._lastDate) {
        self._lastDate = newDate;
    }
};

ThriftMetaFile.prototype.updateRecord =
function updateRecord(folderName, opts, callback) {
    opts = opts || {};
    var self = this;

    self._updateVersion(opts);

    self._remotes[folderName] = {
        time: self._lastDate.toISOString(),
        sha: opts.sha,
        shasums: opts.shasums
    };

    self.save(callback);
};

ThriftMetaFile.prototype.publish = function publish(opts, callback) {
    opts = opts || {};
    var self = this;
    self._updateVersion(opts);
    self._shasums = opts.shasums || {};
    self.save(callback);
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

ThriftMetaFile.prototype.toJSON = function toJSON() {
    var self = this;

    var date = self._lastDate;

    return {
        time: date.toISOString(),
        version: date.getTime(),
        remotes: self._remotes,
        shasums: self._shasums
    };
};

ThriftMetaFile.prototype.toJSONString = function toJSONString() {
    var self = this;
    return JSON.stringify(self.toJSON(), null, 4) + '\n';
};

ThriftMetaFile.prototype.save = function save(callback) {
    var self = this;
    fs.writeFile(self.fileName, self.toJSONString(), 'utf8', callback);
};

ThriftMetaFile.prototype.time = function time() {
    var self = this;

    return self._lastDate;
};
