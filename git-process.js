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
/* eslint-disable no-console */
var assert = require('assert');
var spawn = require('child_process').spawn;
var console = require('console');
var splitargs = require('splitargs');
var once = require('once');
var extend = require('xtend');
var setTimeout = require('timers').setTimeout;
var clearTimeout = require('timers').clearTimeout;

module.exports = Git;
module.exports.exec = gitspawn;
module.exports.spawn = gitspawn;

function Git(gitOpts) {
    gitOpts = gitOpts || {};

    return function git(command, options, callback) {
        options = extend(gitOpts, options || {});
        gitspawn(command, options, callback);
    };
}

function gitspawn(command, options, callback) {
    options = options || {};
    assert(options && options.logger, 'logger required');

    callback = once(callback);
    var commandParts = splitargs(command);
    var handleError = errorHandler(command, options);
    var stdout = '';
    var stderr = '';
    var spawnOpts = {
        cwd: options.cwd
    };

    var helpTimeout = setTimeout(
        timeoutHelp(options),
        options.gitTimeout || 10000
    );
    var git;

    spawnOpts.stdio = [];
    if (options.debugGit) {
        spawnOpts.stdio = 'inherit';
    }

    git = spawn(commandParts.shift(), commandParts, spawnOpts);

    git.once('error', function onError(err) {
        handleError(err, stdout, stderr);
        callback(err, stdout, stderr);
    });

    git.once('exit', function logExitCode(code) {
        clearTimeout(helpTimeout);
        if (code !== 0 && options.debugGit) {
            console.error('git exited with code ' + code);
        }
        callback(null, stdout, stderr);
    });

    return git;
}

function timeoutHelp(options) {
    return function help() {
        var helpText = [
            '',
            'git is taking a long time to execute'
        ];
        if (!options.debugGit) {
            helpText = helpText.concat([
                'try running again with the --debugGit flag to see',
                'the stdout and stderr from git in realtime'
            ]);
        }
        if (options.helpUrl) {
            helpText = helpText.concat([
                '',
                'Additional troubleshooting help can be found at the',
                'following url:',
                options.helpUrl,
                ''
            ]);
        }
        console.error(helpText.join('\n'));
    };
}

function errorHandler(command, options) {
    return function handleError(err, stdout, stderr) {
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
    };
}
