'use strict';
/*eslint-disable no-console*/
var assert = require('assert');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var console = require('console');
var splitargs = require('splitargs');

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

function gitspawn(command, options, callback) {
    options = options || {};
    assert(options && options.logger, 'logger required');
    var commandParts = splitargs(command);

    var git = spawn(commandParts.shift(), commandParts, options);

    git.stdout.on('data', function logStdout(data) {
        console.log('stdout: ' + data);
    });

    git.stderr.on('data', function logStderr(data) {
        console.log('stderr: ' + data);
    });

    git.once('close', function logExitCode(code) {
        console.log('git exited with code ' + code);
        callback();
    });

    return git;
}
