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
    ], callback);
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
