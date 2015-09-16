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
module.exports.timestampTag = timestampTag;
module.exports.pushToOriginWithTags = pushToOriginWithTags;

function addCommitTagAndPushToOrigin(opts, callback) {
    opts = opts || {};

    var ctx = {
        cwd: opts.cwd,
        logger: opts.logger
    };

    series([
        addFiles.bind(ctx, opts.files),
        commitWithMessage.bind(ctx, opts.service, opts.version),
        timestampTag.bind(ctx, opts.service, opts.timestamp),
        pushToOriginWithTags.bind(ctx)
    ], function() {
        callback();
    });
}

function addFiles(files, callback) {
    var command = 'git add ' + files.join(' ');
    gitexec(command, {
        cwd: this.cwd,
        logger: this.logger
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
        logger: this.logger
    }, callback);
}

function timestampTag(service, currTime, callback) {
    var command = 'git tag ' +
        'v' + currTime.getTime() + ' ' +
        '-am "' + currTime.toISOString() + ' ' + service + '"';
    gitexec(command, {
        cwd: this.cwd,
        logger: this.logger
    }, callback);
}

function pushToOriginWithTags(callback) {
    var command = 'git push origin master --tags';
    gitexec(command, {
        cwd: this.cwd,
        logger: this.logger,
        ignoreStderr: true
    }, callback);
}
