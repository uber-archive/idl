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

var series = require('run-series');
var template = require('string-template');

var gitexec = require('./git-process.js').exec;

module.exports.addCommitTagAndPushToOrigin = addCommitTagAndPushToOrigin;
module.exports.addFiles = addFiles;
module.exports.commitWithMessage = commitWithMessage;
module.exports.pushToOriginWithTags = pushToOriginWithTags;

function addCommitTagAndPushToOrigin(opts, callback) {
    opts = opts || {};

    var ctx = {
        cwd: opts.cwd,
        logger: opts.logger,
        debugGit: opts.debugGit
    };

    series([
        addFiles.bind(ctx, opts.files),
        removeFiles.bind(ctx, opts.deletedFiles),
        updateFiles.bind(ctx),
        commitWithMessage.bind(ctx, opts.service, opts.version),
        pushToOriginWithTags.bind(ctx)
    ], callback);
}

function addFiles(files, callback) {
    var command = 'git add ' + files.join(' ');
    gitexec(command, {
        cwd: this.cwd,
        logger: this.logger,
        debugGit: this.debugGit
    }, callback);
}

function removeFiles(files, callback) {
    if (files.length === 0) {
        return callback();
    }
    var command = 'git rm ' + files.join(' ');
    gitexec(command, {
        cwd: this.cwd,
        logger: this.logger,
        debugGit: this.debugGit
    }, callback);
}

function updateFiles(callback) {
    var command = 'git add --update';
    gitexec(command, {
        cwd: this.cwd,
        logger: this.logger,
        debugGit: this.debugGit
    }, callback);
}

function commitWithMessage(service, version, callback) {
    var message = template('Updating {service} to latest version {version}', {
        service: service,
        version: version || ''
    }).trim();

    var command = 'git commit ' + '-m "' + message + '"';
    gitexec(command, {
        cwd: this.cwd,
        logger: this.logger,
        debugGit: this.debugGit
    }, callback);
}

function pushToOriginWithTags(callback) {
    var command = 'git push origin master';
    gitexec(command, {
        cwd: this.cwd,
        logger: this.logger,
        debugGit: this.debugGit,
        ignoreStderr: true
    }, callback);
}
