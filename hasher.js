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

var crypto = require('crypto');
var readDirFiles = require('read-dir-files').read;
var traverse = require('traverse');
var fileFilter = require('./common').fileFilter;

module.exports.sha1 = sha1;
module.exports.shasumFiles = shasumFiles;

function sha1(content) {
    var hash = crypto.createHash('sha1');
    hash.update(content);
    return hash.digest('hex');
}

function relPath(dir) {
    return '.' + dir.substr(dir.lastIndexOf('/idl/'), dir.length);
}

function shasumFiles(dir, callback) {
    readDirFiles(dir, 'utf8', onFiles);

    function onFiles(err, files) {
        if (err) {
            if (err.code === 'ENOENT') {
                err.message = 'Directory not found: ' + relPath(dir);
                err.path = relPath(dir);
            }
            return callback(err);
        }

        var filteredFiles = {};

        traverse(files).forEach(function filter(value) {
            if (!this.isLeaf) {
                return;
            }
            if (this.key && fileFilter(this.key)) {
                filteredFiles[this.path.join('/')] = value;
            }
        });

        var shasums = Object.keys(filteredFiles).reduce(hashFile, {});

        callback(null, shasums);

        function hashFile(memo, filename) {
            memo[filename] = sha1(filteredFiles[filename]);
            return memo;
        }
    }
}
