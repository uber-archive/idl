'use strict';

var assert = require('assert');
var exec = require('child_process').exec;

module.exports = gitexec;

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
