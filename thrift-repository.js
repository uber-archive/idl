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

var exec = require('child_process').exec;
var rimraf = require('rimraf');
var path = require('path');
var assert = require('assert');

module.exports = ThriftRepository;

function ThriftRepository(opts) {
    if (!(this instanceof ThriftRepository)) {
        return new ThriftRepository(opts);
    }

    var self = this;

    self.remotes = opts.remotes;
    self.upstream = opts.upstream;
    self.repositoryFolder = opts.repositoryFolder;
    self.logger = opts.logger;
}

/*
    rm -rf repoFolder;
    git clone upstream repoFolder
*/
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

ThriftRepository.prototype._cloneRepo =
function _cloneRepo(callback) {
    var self = this;

    var cwd = path.dirname(self.repositoryFolder);

    var command = 'git clone ' + self.upstream +
        ' ' + self.repositoryFolder;
    gitexec(command, {
        cwd: cwd,
        logger: self.logger,
        ignoreStderr: true
    }, onCloned);

    function onCloned(err, stdout, stderr) {
        if (err) {
            self.logger.error('git clone repoFolder failed', {
                err: err,
                stderr: stderr
            });
            return callback(err);
        }

        callback(null);
    }
};

function gitexec(command, options, callback) {
    options = options || {};
    assert(options && options.logger, 'logger required');

    exec(command, options, onExec);

    function onExec(err, stdout, stderr) {
        var level = err ? 'warn' :
            stderr && !options.ignoreStderr ? 'warn' :
            'debug';

        options.logger[level]('git output', {
            command: command,
            stdout: stdout,
            stderr: stderr,
            exitCode: err && err.code
        });

        callback(err, stdout, stderr);
    }
}
