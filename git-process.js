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

var assert = require('assert');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var console = require('console');
var splitargs = require('splitargs');
var parseArgs = require('minimist');

module.exports.exec = gitexec;
module.exports.spawn = gitspawn;

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
            exitCode: err && err.code,
            cwd: options.cwd
        });

        callback(err, stdout, stderr);
    }
}

gitexec.gitspawn = gitspawn;

function gitspawn(command, options, callback) {
    options = options || {};
    assert(options && options.logger, 'logger required');
    var commandParts = splitargs(command);
    // console.log(command);
    var git = spawn(commandParts.shift(), commandParts, options);

    git.stdout.on('data', function (data) {
        // console.log('stdout: ' + data);
    });

    git.stderr.on('data', function (data) {
        // console.log('stderr: ' + data);
    });

    git.once('close', function (code) {
        // console.log('git exited with code ' + code);
        callback();
    });

    return git;
}
