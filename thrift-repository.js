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
