#!/usr/bin/env node
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
var readJSON = require('read-json');
var parallel = require('run-parallel');
var rimraf = require('rimraf');
var ncp = require('ncp');
var template = require('string-template');

var GitCommands = require('../git-commands');

var gitexec = require('../git-process.js').exec;
// var gitspawn = require('../git-process.js').spawn;
var ServiceName = require('../service-name');
var ThriftMetaFile = require('../thrift-meta-file.js');
var sha1 = require('../hasher').sha1;
var shasumFiles = require('../hasher').shasumFiles;

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
        path.join(HOME, '.thrift-store', 'upstream-cache');
    self.cwd = opts.cwd || process.cwd();

    self.logger = opts.logger || DebugLogtron('thriftstore');

    self.repoHash = sha1(self.repository);
    self.repoCacheLocation = path.join(
        self.cacheDir, self.repoHash
    );

    self.metaFilename = 'meta.json';
    self.thriftFolder = 'thrift';
    self.thriftExtension = '.thrift';

    self.meta = null;

    self.getServiceName = ServiceName(self.logger);
}

ThriftStore.prototype.help = help;
ThriftStore.prototype.processArgs = processArgs;

ThriftStore.prototype.list = list;
ThriftStore.prototype.install = install;
ThriftStore.prototype.publish = publish;
ThriftStore.prototype.update = update;
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
        '  - install <name>',
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

        switch (self.command) {
            case 'list':
                self.list(cb);
                break;

            case 'install':
                var service = self.remainder[1];

                if (!service) {
                    return cb(new Error('must specify service to install'));
                }

                self.install(service, cb);
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

function install(service, cb) {
    var self = this;
    // TODO: if !service, read from meta.json

    var destination = path.join(self.cwd, self.thriftFolder, service);
    var source = path.join(
        self.repoCacheLocation,
        self.thriftFolder,
        service
    );

    var clientMetaFile = ThriftMetaFile({
        fileName: path.join(self.cwd, self.thriftFolder, self.metaFilename)
    });

    var installedMetaFile = ThriftMetaFile({
        fileName: path.join(destination, self.metaFilename)
    });

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
            return function installDependencyThunk(callback) {
                install(dependency, callback);
            };
        }

        parallel(dependenciesInstallers, onInstalled);
    }

    function onInstalled(err) {
        if (err) {
            return cb(err);
        }

        clientMetaFile.readFile(onClientMetaFileRead);

        function onClientMetaFileRead(readErr) {
            if (readErr) {
                return cb(readErr);
            }

            var installedMeta = installedMetaFile.toJSON();

            clientMetaFile.updateRecord(service, {
                shasums: installedMeta.shasums,
                time: installedMeta.time
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
    var newShasums;
    var publishedMetaFile;
    var destinationMetaFilepath;

    self.getServiceName(self.cwd, onServiceName);

    function onServiceName(err, serviceName) {
        if (err) {
            return cb(err);
        }

        service = serviceName;

        destination = path.join(
            self.repoCacheLocation,
            self.thriftFolder,
            service
        );
        source = path.join(self.cwd, self.thriftFolder, service);

        rimraf(destination, onRimRaf);
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

    function onCopied(err) {
        if (err) {
            return cb(err);
        }

        shasumFiles(source, onShasums);
    }

    function onShasums(err, shasums) {
        if (err) {
            return cb(err);
        }

        newShasums = shasums;

        self.meta.updateRecord(service, {
            shasums: shasums
        }, onRegistryMetaUpdated);
    }

    function onRegistryMetaUpdated(err) {
        if (err) {
            return cb(err);
        }
        publishedMetaFile = ThriftMetaFile({
            fileName: path.join(self.cwd, self.thriftFolder, self.metaFilename)
        });

        publishedMetaFile.readFile(onFileRead);

        function onFileRead(readErr) {
            if (readErr) {
                return cb(readErr);
            }
            publishedMetaFile.publish({
                shasums: newShasums
            }, onPublishedMetaFileWritten);
        }
    }

    function onPublishedMetaFileWritten(err) {
        if (err) {
            return cb(err);
        }

        fs.readFile(publishedMetaFile.fileName, 'utf8', onPublishedRead);

        function onPublishedRead(err2, content) {
            if (err2) {
                return cb(err2);
            }

            destinationMetaFilepath = path.join(
                destination,
                self.metaFilename
            );

            fs.writeFile(
                destinationMetaFilepath,
                content,
                'utf8',
                onMetaPublished
            );
        }
    }

    function onMetaPublished(err) {
        if (err) {
            return cb(err);
        }

        var files = [
            self.meta.fileName,
            destinationMetaFilepath
        ].concat(Object.keys(newShasums).map(getFilepath));

        GitCommands.addCommitTagAndPushToOrigin({
            files: files,
            service: service,
            timestamp: publishedMetaFile.time(),
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

    var metaFile = path.join(self.cwd, self.thriftFolder, self.metaFilename);
    readJSON(metaFile, onMeta);

    function onMeta(err, meta) {
        if (err) {
            // no meta file; nothing to do
            return cb(null);
        }

        var remotes = Object.keys(meta.remotes);
        parallel(remotes.map(function buildThunk(remote) {
            return self.install.bind(self, remote);
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

        self.meta = ThriftMetaFile({
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
