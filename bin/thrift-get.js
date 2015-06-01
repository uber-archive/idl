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

var gitexec = require('../git-exec.js');
var ThriftMetaFile = require('../thrift-meta-file.js');

/*eslint no-process-env: 0*/
var HOME = process.env.HOME;

/*eslint no-console: 0, no-process-exit:0 */
module.exports = ThriftGet;

if (require.main === module) {
    main();
}

function main() {
    var argv = parseArgs(process.argv.slice(2));
    var thriftGet = ThriftGet(argv);
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

function ThriftGet(opts) {
    if (!(this instanceof ThriftGet)) {
        return new ThriftGet(opts);
    }

    var self = this;

    self.remainder = opts._;
    self.command = self.remainder[0];
    self.repository = opts.repository;

    self.cacheDir = opts.cacheDir ||
        path.join(HOME, '.thrift-god', 'upstream-cache');
    self.cwd = opts.cwd || process.cwd();

    self.logger = opts.logger || DebugLogtron('thriftgod');

    self.repoHash = sha1(self.repository);
    self.repoCacheLocation = path.join(
        self.cacheDir, self.repoHash
    );

    self.meta = null;
}

ThriftGet.exec = function exec(string, options, cb) {
    if (typeof options === 'function') {
        cb = options;
        options = {};
    }

    var opts = extend(options, parseArgs(string.split(' ')));
    var thriftGet = ThriftGet(opts);

    thriftGet.processArgs(cb);
    return thriftGet;
};

ThriftGet.prototype.processArgs = function processArgs(cb) {
    var self = this;

    self.fetchRepository(onRepository);

    function onRepository(err) {
        if (err) {
            return cb(err);
        }

        switch (self.command) {
            case 'list':
                self.list(cb);
                break;

            case 'add':
                self.add(cb);
                break;

            case 'update':
                self.update(cb);
                break;

            default:
                cb(new Error('unknown command ' + self.command));
                break;
        }
    }
};

ThriftGet.prototype.list = function list(cb) {
    var self = this;

    return cb(null, ListText(self.meta));
};

function ListText(meta) {
    if (!(this instanceof ListText)) {
        return new ListText(meta);
    }

    var self = this;

    self.remotes = meta.remotes;
}

ListText.prototype.toString = function toString() {
    var self = this;

    var tuples = Object.keys(self.remotes)
        .map(function toTuple(remoteKey) {
            var remote = self.remotes[remoteKey];

            return [' - ' + remoteKey, remote.time];
        });

    return textTable(tuples);
};

ThriftGet.prototype.add = function add(cb) {
    var self = this;

    var name = self.remainder[1];

    if (!name) {
        return cb(new Error('must specify name to add'));
    }

    // TODO read remote meta data and do properly
    var destination = path.join(
        self.cwd, 'thrift', name + '.thrift'
    );
    var source = path.join(
        self.repoCacheLocation, 'thrift', name + '.thrift'
    );

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
            fileName: path.join(self.cwd, 'thrift', 'meta.json')
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
};

ThriftGet.prototype.fetchRepository =
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
            self.repoCacheLocation, 'meta.json'
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
};

ThriftGet.prototype.cloneRepository =
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
};

ThriftGet.prototype.pullRepository =
function pullRepository(cb) {
    var self = this;

    var cwd = self.repoCacheLocation;
    var command = 'git fetch --all';
    gitexec(command, {
        cwd: cwd,
        logger: self.logger
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
};

function sha1(content) {
    var hash = crypto.createHash('sha1');
    hash.update(content);
    return hash.digest('hex');
}
