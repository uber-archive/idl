'use strict';

var tape = require('tape');
var path = require('path');
var fs = require('fs');
var series = require('run-series');
var parallel = require('run-parallel');
var exec = require('child_process').exec;
var createFixtures = require('fixtures-fs/create-fixtures');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var wrapCluster = require('tape-cluster');
var extend = require('xtend');
var DebugLogtron = require('debug-logtron');
var TimeMock = require('time-mock');
var readDirFiles = require('read-dir-files').read;

var ThriftGod = require('../../bin/thrift-god.js');
var ThriftStore = require('../../bin/thrift-store.js');

var defaultRepos = {
    'A': {
        gitUrl: 'git@github.com:org/a',
        branch: 'master',
        files: {
            'thrift': {
                'service.thrift': '' +
                    'service A {\n' +
                    '    i32 echo(1:i32 value)\n' +
                    '}\n'
            }
        },
        localFileName: 'thrift/service.thrift'
    },
    'B': {
        gitUrl: 'git@github.com:org/b',
        branch: 'master',
        files: {
            'thrift': {
                'service.thrift': '' +
                    'service B {\n' +
                    '    i32 echo(1:i32 value)\n' +
                    '}\n'
            }
        },
        localFileName: 'thrift/service.thrift'
    },
    'C': {
        gitUrl: 'git@github.com:org/c',
        branch: 'master',
        files: {
            'thrift': {
                'service.thrift': '' +
                    'service C {\n' +
                    '    i32 echo(1:i32 value)\n' +
                    '}\n'
            }
        },
        localFileName: 'thrift/service.thrift'
    },
    'D': {
        gitUrl: 'git@github.com:org/d',
        branch: 'master',
        files: {
            'thrift': {
                'service.thrift': '' +
                    'service D {\n' +
                    '    i32 echo(1:i32 value)\n' +
                    '}\n'
            }
        },
        localFileName: 'thrift/service.thrift'
    }
};

TestCluster.test = wrapCluster(tape, TestCluster);

module.exports = TestCluster;

function TestCluster(opts) {
    if (!(this instanceof TestCluster)) {
        return new TestCluster(opts);
    }

    opts = opts || {};

    var self = this;

    self.remoteRepos = extend(defaultRepos, opts.remoteRepos || {});
    self.repoFixtures = Object.keys(self.remoteRepos)
        .reduce(function getFiles(acc, name) {
            acc[name] = self.remoteRepos[name].files;
            return acc;
        }, {});
    self.prepareOnly = opts.prepareOnly || false;

    self.fixturesDir = path.join(__dirname, '..', 'fixtures');
    self.remotesDir = path.join(self.fixturesDir, 'remotes');
    self.upstreamDir = path.join(self.fixturesDir, 'upstream');
    self.repositoryDir = path.join(self.fixturesDir, 'repository');
    self.configFile = path.join(self.fixturesDir, 'config.json');
    self.cacheDir = path.join(self.fixturesDir, 'remote-cache');
    self.getCacheDir = path.join(self.fixturesDir, 'upstream-cache');
    self.localApp = path.join(self.fixturesDir, 'local-app');

    self.config = extend({
        upstream: 'file://' + self.upstreamDir,
        repositoryFolder: self.repositoryDir,
        fileNameStrategy: 'lastSegment',
        cacheLocation: self.cacheDir,
        fetchInterval: opts.fetchInterval || 30 * 1000,
        remotes: Object.keys(self.remoteRepos)
            .map(function buildRepoObj(remoteName) {
                var repoInfo = self.remoteRepos[remoteName];

                return {
                    repository: 'file://' + path.join(
                        self.remotesDir, remoteName
                    ),
                    branch: repoInfo.branch || 'master',
                    localFileName: repoInfo.localFileName
                };
            })
    }, opts.config || {});

    self.logger = DebugLogtron('thriftgod');
    self.timers = TimeMock(0);
    self.thriftGod = null;
}

TestCluster.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    series([
        rimraf.bind(null, self.fixturesDir),
        mkdirp.bind(null, self.remotesDir),
        createFixtures.bind(null, self.remotesDir, self.repoFixtures),
        self.gitify.bind(self),
        self.setupUpstream.bind(self),
        self.writeConfigFile.bind(self),
        self.prepareOnly ? null : self.setupThriftGod.bind(self)
    ].filter(Boolean), cb);
};

// git init
// git a .
// git commit -m 'initial'
TestCluster.prototype.gitify = function gitify(cb) {
    var self = this;

    var keys = Object.keys(self.remoteRepos);
    var tasks = keys.map(function buildThunk(remoteKey) {
        var repoInfo = self.remoteRepos[remoteKey];
        var cwd = path.join(self.remotesDir, remoteKey);

        return function thunk(callback) {
            var gitOpts = {
                cwd: cwd
            };

            series([
                git('init', gitOpts),
                git('remote add origin ' + repoInfo.gitUrl, gitOpts),
                git('commit --allow-empty -am "initial"', gitOpts),
                repoInfo.branch !== 'master' ?
                    git('checkout -b ' + repoInfo.branch, gitOpts) : null,
                git('add --all .', gitOpts),
                git('commit -am "second"', gitOpts)
            ].filter(Boolean), callback);
        };
    });

    return parallel(tasks, cb);
};

TestCluster.prototype.updateRemote =
function updateRemote(name, files, callback) {
    var self = this;

    var remoteDir = path.join(self.remotesDir, name);

    series([
        rimraf.bind(null, path.join(remoteDir, 'thrift')),
        createFixtures.bind(null, remoteDir, files),
        git('add --all .', {
            cwd: remoteDir
        }),
        git('commit -am "update files"', {
            cwd: remoteDir
        })
    ], callback);
};

TestCluster.prototype.setupUpstream = function setupUpstream(cb) {
    var self = this;

    series([
        mkdirp.bind(null, self.upstreamDir),
        git('init', {
            cwd: self.upstreamDir
        }),
        git('commit --allow-empty -am "initial"', {
            cwd: self.upstreamDir
        }),
        git('config --bool core.bare true', {
            cwd: self.upstreamDir
        })
    ], cb);
};

TestCluster.prototype.writeConfigFile =
function writeConfigFile(cb) {
    var self = this;

    var data = JSON.stringify(self.config, null, '    ') + '\n';
    fs.writeFile(self.configFile, data, 'utf8', cb);
};

TestCluster.prototype.setupThriftGod =
function setupThriftGod(cb) {
    var self = this;

    if (self.thriftGod) {
        self.thriftGod.destroy();
    }

    self.thriftGod = ThriftGod({
        configFile: self.configFile,
        logger: self.logger,
        timers: self.timers
    });
    self.thriftGod.bootstrap(cb);
};

TestCluster.prototype.gitlog = function gitlog(cb) {
    var self = this;

    var command = 'git log --pretty="%s"';
    exec(command, {
        cwd: self.upstreamDir
    }, cb);
};

TestCluster.prototype.gitshow = function gitshow(file, cb) {
    var self = this;

    var command = 'git show HEAD:' + file;
    exec(command, {
        cwd: self.upstreamDir
    }, cb);
};

TestCluster.prototype.gittag = function gittag(cb) {
    var self = this;

    var command = 'git tag --list';
    exec(command, {
        cwd: self.upstreamDir
    }, cb);
};

TestCluster.prototype.inspectUpstream =
function inspectUpstream(callback) {
    var self = this;

    var keys = Object.keys(self.remoteRepos);
    var remoteTasks = keys.reduce(function b(acc, key) {
        acc[key] = self.gitshow.bind(self, 'thrift/' + key + '.thrift');
        return acc;
    }, {});

    parallel({
        gitlog: self.gitlog.bind(self),
        gittag: self.gittag.bind(self),
        meta: function thunk(cb) {
            self.gitshow('meta.json', onFile);

            function onFile(err, file) {
                if (err) {
                    return cb(err);
                }

                cb(null, JSON.parse(file));
            }
        },
        thrift: self.gitshow.bind(self, 'thrift'),
        remotes: parallel.bind(null, remoteTasks)
    }, callback);
};

TestCluster.prototype.inspectLocalApp =
function inspectLocalApp(callback) {
    var self = this;

    readDirFiles(self.localApp, 'utf8', callback);
};

TestCluster.prototype.thriftGet = function thriftGet(text, cb) {
    var self = this;

    text = text + ' --repository=' + 'file://' + self.upstreamDir;
    text = text + ' --cacheDir=' + self.getCacheDir;
    text = text + ' --cwd=' + self.localApp;

    return ThriftStore.exec(text, {
        logger: self.logger
    }, cb);
};

TestCluster.prototype.close = function close(cb) {
    var self = this;

    self.thriftGod.destroy();
    rimraf(self.fixturesDir, cb);
};

function git(text, opts) {
    return exec.bind(null, 'git ' + text, opts);
}
