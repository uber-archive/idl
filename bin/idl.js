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
var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var DebugLogtron = require('debug-logtron');
var extend = require('xtend');
var textTable = require('text-table');
var parallel = require('run-parallel');
var cpr = require('cpr');
var rc = require('rc');
var rcUtils = require('rc/lib/utils');
var camelCaseKeys = require('camelcase-keys');
var traverse = require('traverse');
var deepEqual = require('deep-equal');
var globalTimers = require('timers');
var series = require('run-series');
var TypedError = require('error/typed');
var GitCommands = require('../git-commands');
var readDirFiles = require('read-dir-files').read;

var Git = require('../git-process.js');
var ServiceName = require('../service-name');
var MetaFile = require('../meta-file.js');
var sha1 = require('../hasher').sha1;
var shasumFiles = require('../hasher').shasumFiles;
// var getDependencies = require('../get-dependencies');
var common = require('../common');

var envPrefixes = [
    'IDL'
];

var UnknownServiceError = TypedError({
    type: 'unknown-service',
    message: 'The service {service} is not published in the registry',
    service: null
});

var minimistOpts = {
    string: ['repository', 'cwd', 'cacheDir'],
    boolean: ['silent', 'verbose', 'trace', 'colors'],
    alias: {
        h: 'help',
        s: 'silent',
        v: 'version',
        registry: 'repository'
    },
    default: {
        silent: false,
        verbose: false,
        trace: false,
        colors: true,
        debugGit: false,
        gitTimeout: 10000
    }
};

/*eslint no-process-env: 0*/
var HOME = process.env.HOME;

/*eslint no-console: 0, no-process-exit:0 */
module.exports = IDL;

function main() {
    var argv = parseArgs(process.argv.slice(2), minimistOpts);

    var conf = extend(
        rc('idl', {}, argv),
        env(),
        argv
    );

    conf.logOpts = {};
    conf.logOpts.enabled = !conf.silent;
    conf.logOpts.verbose = conf.verbose;
    conf.logOpts.trace = conf.trace;
    conf.logOpts.colors = conf.colors;

    IDL(conf).processArgs(function onFini(err, text) {
        if (err) {
            console.error('ERR: ' + err);
            process.exit(1);
        }

        if (text) {
            console.log(text.toString());
        }
    });
}

function env() {
    return envPrefixes.reduce(getEnvConf, {});

    function getEnvConf(memo, prefix) {
        var envConf = rcUtils.env(prefix + '_');
        return extend(memo, traverse(envConf).map(camelcaseObjectKeys));
    }

    function camelcaseObjectKeys(value) {
        if (typeof value === 'object') {
            this.update(camelCaseKeys(value));
        }
    }
}

function IDL(opts) {
    if (!(this instanceof IDL)) {
        return new IDL(opts);
    }

    var self = this;

    if (!opts.repository) {
        throw new Error('--repository is required');
    }

    self.remainder = opts._;
    self.command = self.remainder[0];
    self.repository = opts.repository;
    self.helpFlag = opts.help;

    self.cacheDir = opts.cacheDir ||
        path.join(HOME, '.idl', 'upstream-cache');
    self.cwd = opts.cwd || process.cwd();

    self.logger = opts.logger || DebugLogtron('idl', opts.logOpts || {});

    self.repoHash = sha1(self.repository);
    self.repoCacheLocation = path.join(
        self.cacheDir, self.repoHash
    );

    self.timers = opts.timers || extend(globalTimers, {
        now: Date.now
    });

    self.metaFilename = 'meta.json';
    self.idlFolder = 'idl';

    self.meta = null;

    self.getServiceName = ServiceName(self.logger);

    self.git = Git({
        logger: self.logger,
        debugGit: opts.debugGit,
        gitTimeout: opts.gitTimeout,
        helpUrl: opts.helpUrl,
        twoFactorPrompt: opts.twoFactorPrompt,
        twoFactor: opts.twoFactor
    });
}

IDL.prototype.help = help;
IDL.prototype.processArgs = processArgs;

IDL.prototype.list = list;
IDL.prototype.fetch = fetch;
IDL.prototype.publish = publish;
IDL.prototype.update = update;
IDL.prototype.show = show;
IDL.prototype.fetchRepository = fetchRepository;
IDL.prototype.cloneRepository = cloneRepository;
IDL.prototype.pullRepository = pullRepository;
IDL.prototype.checkoutRef = checkoutRef;

IDL.exec = function exec(string, options, cb) {
    if (typeof options === 'function') {
        cb = options;
        options = {};
    }

    var opts = extend(options, parseArgs(string.split(' '), minimistOpts));
    var idl = IDL(opts);

    idl.processArgs(cb);
    return idl;
};

function help() {
    var helpText = [
        'usage: idl --repository=<repo> [--help] [-h]',
        '                    <command> <args>',
        '',
        'Where <command> is one of:',
        '  - list',
        '  - fetch <name>',
        '  - publish',
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
        var service;

        switch (self.command) {
            case 'list':
                self.list(cb);
                break;

            case 'fetch':
                service = self.remainder[1];
                self.fetch(service, cb);
                break;

            case 'show':
                service = self.remainder[1];
                self.show(service, cb);
                break;

            case 'publish':

                self.publish(cb);
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

function fetchFromMeta(cb) {
    var self = this;

    var localMeta = MetaFile({
        fileName: path.join(
            self.cwd,
            self.idlFolder,
            self.metaFilename
        )
    });

    localMeta.readFile(onReadLocalMeta);

    function onReadLocalMeta(err) {
        if (err) {
            return cb(err);
        }

        var version = localMeta.toJSON().version;
        self.checkoutRef('v' + version, onCheckoutRegistryTag);
    }

    function onCheckoutRegistryTag(err) {
        if (err) {
            return cb(err);
        }

        var services = Object.keys(localMeta.toJSON().remotes)
            .map(makeFetchServiceThunk);

        parallel(services, cb);
    }

    function makeFetchServiceThunk(service) {
        return fetch.bind(self, service);
    }
}

function fetch(service, cb) {
    var self = this;

    if (!service) {
        return fetchFromMeta.call(self, cb);
    }

    var clientMetaFile = MetaFile({
        fileName: path.join(
            self.cwd,
            self.idlFolder,
            self.metaFilename
        )
    });

    clientMetaFile.readFile(onReadLocalMeta);

    function onReadLocalMeta(err) {
        if (err) {
            return cb(err);
        }

        var alreadyFetched = !!clientMetaFile.toJSON().remotes[service];
        var existsInRegistry = !!self.meta.toJSON().remotes[service];

        if (!existsInRegistry) {
            cb(UnknownServiceError({
                service: service
            }));
        }

        if (alreadyFetched) {
            onUpdate();
        } else {
            self.update(onUpdate);
        }
    }

    function onUpdate(err) {
        if (err) {
            return cb(err);
        }

        var destination = path.join(
            self.cwd,
            self.idlFolder,
            service
        );

        var source = path.join(
            self.repoCacheLocation,
            self.idlFolder,
            service
        );

        cpr(source, destination, {
            deleteFirst: true,
            overwrite: true,
            confirm: true,
            filter: common.fileFilter
        }, onCopied);
    }

    function onCopied(err) {
        if (err) {
            return cb(err);
        }

        clientMetaFile.readFile(onReadFile);

        function onReadFile(err2) {
            if (err2) {
                return cb(err2);
            }

            clientMetaFile.updateRecord(
                service,
                self.meta.getRecord(service),
                onUpdatedClientMeta
            );
        }
    }

    function onUpdatedClientMeta(err) {
        if (err) {
            return cb(err);
        }

        clientMetaFile.save(cb);
    }

    // function onClientMetaSaved(err) {
    //     if (err) {
    //         return cb(err);
    //     }
    //     console.log('===>', path.resolve(self.cwd, service));
    //     getDependencies(path.resolve(self.cwd, service), onDependencies)

    // }

    // function onDependencies(err, dependencies) {
    //     if (err) {
    //         return cb(err);
    //     }

    //     console.log(service, dependencies);

    //     return cb();

    //     var dependenciesFetchers = Object.keys(dependencies)
    //         .map(makeFetcher);

    //     function makeFetcher(dependency) {
    //         return function fetchDependencyThunk(callback) {
    //             fetch(dependency, callback);
    //         };
    //     }

    //     series(dependenciesFetchers, cb);
    // }

}

function show(service, cb) {
    var self = this;

    if (!service) {
        return cb(new Error('service unspecified'));
    }

    var existsInRegistry = !!self.meta.toJSON().remotes[service];

    if (!existsInRegistry) {
        cb(UnknownServiceError({
            service: service
        }));
    }

    var source = path.join(
        self.repoCacheLocation,
        self.idlFolder,
        service
    );

    readDirFiles(source, 'utf8', onReadFiles);

    function onReadFiles(err, files) {
        if (err) {
            return cb(err);
        }

        traverse(files).forEach(printFile);

        function printFile(value) {
            var filepath = this.path.join('/');
            if (/\.thrift$/.test(filepath)) {
                process.stdout.write(path.join(service, filepath) + '\n');
                process.stdout.write(value + '\n');
            }
        }
        cb();
    }
}

function publish(cb) {
    var self = this;
    var destination;
    var source;
    var service;
    var currentShasums;
    var newShasums;

    self.getServiceName(self.cwd, onServiceName);

    function onServiceName(err, serviceName) {
        if (err) {
            return cb(err);
        }

        service = serviceName;

        destination = path.join(
            self.repoCacheLocation,
            self.idlFolder,
            service
        );
        source = path.join(
            self.cwd,
            self.idlFolder,
            service
        );

        shasumFiles(source, onSourceShasums);
    }

    function onSourceShasums(err, shasums) {
        if (err) {
            return cb(err);
        }
        newShasums = shasums;

        fs.exists(destination, onExists);

        function onExists(exists) {
            if (exists) {
                shasumFiles(destination, onDestinationShasums);
            } else {
                onDestinationShasums(null, {});
            }
        }
    }

    function onDestinationShasums(err, shasums) {
        if (err) {
            return cb(err);
        }
        currentShasums = shasums;

        if (deepEqual(currentShasums, newShasums)) {
            return cb(null);
        } else {
            cpr(source, destination, {
                deleteFirst: true,
                overwrite: true,
                confirm: true,
                filter: common.fileFilter
            }, onCopied);
        }
    }

    function onCopied(err, shasums) {
        if (err) {
            return cb(err);
        }

        self.meta.updateRecord(service, {
            time: self.timers.now(),
            shasums: newShasums
        }, onRegistryMetaUpdated);
    }

    function onRegistryMetaUpdated(err) {
        if (err) {
            return cb(err);
        }

        var files = [
            self.meta.fileName
        ].concat(Object.keys(newShasums).map(getFilepath));

        GitCommands.addCommitTagAndPushToOrigin({
            files: files,
            service: service,
            timestamp: self.meta.time(),
            cwd: self.repoCacheLocation,
            logger: self.logger
        }, cb);

        function getFilepath(filename) {
            return path.join(destination, filename);
        }
    }
}

function update(cb) {
    var self = this;

    var clientMetaFile = MetaFile({
        fileName: path.join(
            self.cwd,
            self.idlFolder,
            self.metaFilename
        )
    });

    clientMetaFile.readFile(onMeta);

    function onMeta(err, meta) {
        if (err) {
            // no meta file; nothing to do
            return cb(null);
        }

        var remotes = Object.keys(clientMetaFile.toJSON().remotes);
        series(remotes.map(function buildThunk(remote) {
            return self.fetch.bind(self, remote);
        }), cb);
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

        self.checkoutRef('master', onRepoFetched);
    }

    function onRepoFetched(err) {
        if (err) {
            return cb(err);
        }

        self.meta = MetaFile({
            fileName: path.join(self.repoCacheLocation, self.metaFilename)
        });

        self.meta.readFile(cb);
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
        self.git(command, {
            cwd: cwd,
            ignoreStderr: true
        }, cb);
    }
}

function pullRepository(cb) {
    var self = this;

    var cwd = self.repoCacheLocation;
    var command = 'git fetch --all';
    self.git(command, {
        cwd: cwd,
        ignoreStderr: true
    }, onFetch);

    function onFetch(err) {
        if (err) {
            return cb(err);
        }

        var command2 = 'git merge --ff-only origin/master';
        self.git(command2, {
            cwd: cwd
        }, cb);
    }
}

function checkoutRef(ref, cb) {
    var self = this;

    var cwd = self.repoCacheLocation;
    var command = 'git checkout ' + ref;
    self.git(command, {
        cwd: cwd,
        ignoreStderr: true
    }, cb);
}

function ListText(meta) {
    if (!(this instanceof ListText)) {
        return new ListText(meta);
    }

    var self = this;

    self.remotes = meta.toJSON().remotes;
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

if (require.main === module) {
    main();
}
