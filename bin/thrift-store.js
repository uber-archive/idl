#!/usr/bin/env node

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

var parseArgs = require('minimist');
var process = require('process');
var console = require('console');
var crypto = require('crypto');
var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var DebugLogtron = require('debug-logtron');
var extend = require('xtend');
var textTable = require('text-table');
var readJSON = require('read-json');
var parallel = require('run-parallel');
var rimraf = require('rimraf');
var ncp = require('ncp');

var gitexec = require('../git-exec.js');
var ThriftMetaFile = require('../thrift-meta-file.js');

/*eslint no-process-env: 0*/
var HOME = process.env.HOME;

/*eslint no-console: 0, no-process-exit:0 */
module.exports = ThriftStore;

function main() {
    var argv = parseArgs(process.argv.slice(2));
    var thriftGet = ThriftStore(argv);
    thriftGet.processArgs(function onFini(err, text) {
        if (err) {
            console.error('ERR: ' + err);
            process.exit(1);
        }

        if (text) {
            console.log(text.toString());
        }
    });
}

function ThriftStore(opts) {
    if (!(this instanceof ThriftStore)) {
        return new ThriftStore(opts);
    }

    var self = this;

    if (!opts.repository) {
        throw new Error('--repository is required');
    }

    self.remainder = opts._;
    self.command = self.remainder[0];
    self.repository = opts.repository;
    self.helpFlag = opts.h || opts.help;

    self.cacheDir = opts.cacheDir ||
        path.join(HOME, '.thrift-god', 'upstream-cache');
    self.cwd = opts.cwd || process.cwd();

    self.logger = opts.logger || DebugLogtron('thriftgod');

    self.repoHash = sha1(self.repository);
    self.repoCacheLocation = path.join(
        self.cacheDir, self.repoHash
    );

    self.metaFilename = 'meta.json';
    self.thriftFolder = 'thrift';
    self.thriftExtension = '.thrift';

    self.meta = null;
}

ThriftStore.prototype.help = help;
ThriftStore.prototype.processArgs = processArgs;

ThriftStore.prototype.list = list;
ThriftStore.prototype.fetch = fetch;
ThriftStore.prototype.install = install;
ThriftStore.prototype.publish = publish;
ThriftStore.prototype.update = update;
ThriftStore.prototype.getServiceName = getServiceName;
ThriftStore.prototype.fetchRepository = fetchRepository;
ThriftStore.prototype.cloneRepository = cloneRepository;
ThriftStore.prototype.pullRepository = pullRepository;

ThriftStore.exec = function exec(string, options, cb) {
    if (typeof options === 'function') {
        cb = options;
        options = {};
    }

    var opts = extend(options, parseArgs(string.split(' ')));
    var thriftStore = ThriftStore(opts);

    thriftStore.processArgs(cb);
    return thriftStore;
};

function help() {
    var helpText = [
        'usage: thrift-store --repository=<repo> [--help] [-h]',
        '                    <command> <args>',
        '',
        'Where <command> is one of:',
        '  - list',
        '  - fetch <name>',
        '  - update'
    ].join('\n');
    console.log(helpText);
}

function processArgs(cb) {
    var self = this;

    if (self.helpFlag || self.command === 'help') {
        return self.help();
    }

    self.fetchRepository(onRepository);

    function onRepository(err) {
        if (err) {
            return cb(err);
        }

        switch (self.command) {
            case 'list':
                self.list(cb);
                break;

            case 'fetch':
                var name = self.remainder[1];

                if (!name) {
                    return cb(new Error('must specify name to fetch'));
                }

                self.fetch(name, cb);
                break;

            case 'update':
                self.update(cb);
                break;

            default:
                cb(new Error('unknown command ' + self.command));
                break;
        }
    }
}

function list(cb) {
    var self = this;

    return cb(null, ListText(self.meta));
}

function install(service, cb) {
    var self = this;

    // if !service, read from meta.json

    var relativeServicePath = path.join(self.thriftFolder, service);

    var destination = path.join(self.cwd, relativeServicePath);
    var source = path.join(self.repoCacheLocation, relativeServicePath);

    rimraf(path.dirname(destination), onRimRaf);

    function onRimRaf(err) {
        if (err) {
            return cb(err);
        }
        mkdirp(path.dirname(destination), onDir);
    }

    function onDir(err) {
        if (err) {
            return cb(err);
        }

        ncp(source, destination, onCopied);
    }

    function onCopied(err) {
        if (err) {
            return cb(err);
        }

        var installedMetaFile = ThriftMetaFile({
            fileName: path.join(destination, self.metaFilename)
        });

        installedMetaFile.readFile(onInstalledMetaFileRead);

        function onInstalledMetaFileRead(readErr) {
            if (readErr) {
                return cb(readErr);
            }

            installedMetaFile.getDependencies(onDependencies);
        }
    }

    function onDependencies(err, dependencies) {
        if (err) {
            return cb(err);
        }

        var dependenciesInstallers = Object.keys(dependencies)
            .map(makeInstaller);

        function makeInstaller(dependency) {
            return function installDependency(callback) {
                install(dependency, callback);
            };
        }

        dependenciesInstallers.push(onInstalled);

        parallel(dependenciesInstallers);
    }

    function onInstalled() {
        var metaFile = ThriftMetaFile({
            fileName: path.join(self.cwd, self.thriftFolder, self.metaFilename)
        });

        metaFile.readFile(onFileRead);

        function onFileRead(err) {
            if (err) {
                return cb(err);
            }

            metaFile.updateRecord(service, {
                sha: self.meta.remotes[service].sha,
                time: self.meta.remotes[service].time
            }, onMetaUpdated);
        }
    }

    function onMetaUpdated(err) {
        if (err) {
            return cb(err);
        }

        cb(null);
    }

}

function publish(cb) {
    var self = this;
    var destination;
    var source;
    var service;

    self.getServiceName(onServiceName);

    function onServiceName(err, serviceName) {
        if (err) {
            return cb(err);
        }

        service = serviceName;

        var relativeServicePath = path.join(self.thriftFolder, service);

        destination = path.join(self.repoCacheLocation, relativeServicePath);
        source = path.join(self.cwd, relativeServicePath);

        rimraf(path.dirname(destination), onRimRaf);
    }

    function onRimRaf(err) {
        if (err) {
            return cb(err);
        }
        mkdirp(path.dirname(destination), onDir);
    }

    function onDir(err) {
        if (err) {
            return cb(err);
        }

        ncp(source, destination, onCopied);
    }

    function onCopied() {
        var metaFile = ThriftMetaFile({
            fileName: path.join(self.repoCacheLocation, self.metaFilename)
        });

        metaFile.readFile(onFileRead);

        function onFileRead(err) {
            if (err) {
                return cb(err);
            }

            metaFile.updateRecord(service, {
                sha: self.meta.remotes[service].sha,
                time: self.meta.remotes[service].time
            }, onMetaUpdated);
        }
    }

    function onMetaUpdated(err) {
        if (err) {
            return cb(err);
        }

        cb(null);
    }
}

function fetch(name, cb) {
    var self = this;

    var relativeServicePath = path.join(
        self.thriftFolder, name + self.thriftExtension
    );

    // TODO read remote meta data and do properly
    var destination = path.join(self.cwd, relativeServicePath);
    var source = path.join(self.repoCacheLocation, relativeServicePath);

    mkdirp(path.dirname(destination), onDir);

    function onDir(err) {
        if (err) {
            return cb(err);
        }

        fs.createReadStream(source)
            .once('error', cb)
            .pipe(fs.createWriteStream(destination))
            .once('error', cb)
            .once('finish', onFinish);
    }

    function onFinish() {
        var metaFile = ThriftMetaFile({
            fileName: path.join(self.cwd, self.thriftFolder, self.metaFilename)
        });

        metaFile.readFile(onFileRead);

        function onFileRead(err) {
            if (err) {
                return cb(err);
            }

            metaFile.updateRecord(name, {
                sha: self.meta.remotes[name].sha,
                time: self.meta.remotes[name].time
            }, onMetaUpdated);
        }
    }

    function onMetaUpdated(err) {
        if (err) {
            return cb(err);
        }

        cb(null);
    }
}

function update(cb) {
    var self = this;

    var metaFile = path.join(self.cwd, self.thriftFolder, self.metaFilename);
    readJSON(metaFile, onMeta);

    function onMeta(err, meta) {
        if (err) {
            // no meta file; nothing to do
            return cb(null);
        }

        var remotes = Object.keys(meta.remotes);
        parallel(remotes.map(function buildThunk(remote) {
            return self.fetch.bind(self, remote);
        }), onFini);
    }

    function onFini(err) {
        if (err) {
            return cb(err);
        }

        cb(null);
    }
}

function fetchRepository(cb) {
    var self = this;

    fs.exists(self.repoCacheLocation, onExists);

    function onExists(exists) {
        if (exists) {
            self.pullRepository(onFetched);
        } else {
            self.cloneRepository(onFetched);
        }
    }

    function onFetched(err) {
        if (err) {
            return cb(err);
        }

        var metaFileName = path.join(
            self.repoCacheLocation, self.metaFilename
        );
        readJSON(metaFileName, onMeta);
    }

    function onMeta(err, meta) {
        if (err) {
            return cb(err);
        }

        self.meta = meta;
        cb(null);
    }
}

function cloneRepository(cb) {
    var self = this;

    mkdirp(self.cacheDir, onCacheDir);

    function onCacheDir(err) {
        if (err) {
            return cb(err);
        }

        var cwd = path.dirname(self.repoCacheLocation);

        var command = 'git clone ' +
            self.repository + ' ' +
            self.repoCacheLocation;
        gitexec(command, {
            cwd: cwd,
            logger: self.logger,
            ignoreStderr: true
        }, cb);
    }
}

function pullRepository(cb) {
    var self = this;

    var cwd = self.repoCacheLocation;
    var command = 'git fetch --all';
    gitexec(command, {
        cwd: cwd,
        logger: self.logger,
        ignoreStderr: true
    }, onFetch);

    function onFetch(err) {
        if (err) {
            return cb(err);
        }

        var command2 = 'git merge --ff-only origin/master';
        gitexec(command2, {
            cwd: cwd,
            logger: self.logger
        }, cb);
    }
}

function getServiceName(cb) {
    var self = this;

    var command = 'git remote --verbose';
    gitexec(command, {
        cwd: self.cwd,
        logger: self.logger,
        ignoreStderr: true
    }, onVerboseRemote);

    function onVerboseRemote(err, stdout, stderr) {
        if (err) {
            return cb(err);
        }

        // this works for both HTTPS and SSH git remotes
        var gitUrl = stdout
            .split(/\s/)[1]     // get the first git url
            .split('@')[1]      // drop everything before the username
            .split('.git')[0]   // drop .git suffix if one
            .replace(':', '/'); // convert to valid path

        cb(null, gitUrl);
    }
}

function ListText(meta) {
    if (!(this instanceof ListText)) {
        return new ListText(meta);
    }

    var self = this;

    self.remotes = meta.remotes;
}

ListText.prototype.toString = toString;

function toString() {
    var self = this;

    var tuples = Object.keys(self.remotes)
        .map(function toTuple(remoteKey) {
            var remote = self.remotes[remoteKey];

            return [' - ' + remoteKey, remote.time];
        });

    return textTable(tuples);
}

function sha1(content) {
    var hash = crypto.createHash('sha1');
    hash.update(content);
    return hash.digest('hex');
}

if (require.main === module) {
    main();
}
