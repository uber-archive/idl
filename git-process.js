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
