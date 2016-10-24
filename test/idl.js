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

var parallel = require('run-parallel');
var series = require('run-series');
var path = require('path');
var tk = require('timekeeper');
var template = require('string-template');
var process = require('process');
var timeAgo = require('time-ago')();
var stringLength = require('string-length');
var textTable = require('text-table');
var chalk = require('chalk');
var fs = require('graceful-fs');

var thriftIdl = require('./lib/thrift-idl');
var TestCluster = require('./lib/test-cluster.js');

var updatedThriftIdlTemplate = '' +
    'service {remoteName} {\n' +
    '    i32 echo(1:i32 value)\n' +
    '    i64 echo64(1:i64 value)\n' +
    '}\n';

TestCluster.test('run `idl init`', {
}, function t(cluster, assert) {

    series([
        cluster.idlGet.bind(cluster, 'init'),
        cluster.inspectLocalApp.bind(cluster)
    ], onResults);

    function onResults(err, results) {
        if (err) {
            assert.ifError(err);
        }
        var local = results[1];

        var expected = [
            'typedef string UUID',
            'typedef i64 Timestamp',
            '',
            'service Idl {',
            '    UUID echo(',
            '        1: UUID uuid',
            '    )',
            '}',
            ''
        ].join('\n');

        assert.equal(
            local.idl['github.com'].uber.idl['idl.thrift'],
            expected,
            'Correct IDL file contents at the correct path'
        );

        assert.end();
    }
});

TestCluster.test('run `idl list`', {
}, function t(cluster, assert) {

    tk.freeze(new Date());

    parallel({
        list: cluster.idlGet.bind(cluster, 'list'),
        upstream: cluster.inspectUpstream.bind(cluster)
    }, onResults);

    function onResults(err, data) {
        if (err) {
            assert.ifError(err);
        }

        var list = data.list;
        var upstream = data.upstream;

        assert.equal(
            upstream.meta.remotes['github.com/org/a'].time,
            list.remotes['github.com/org/a'].time
        );
        assert.equal(
            upstream.meta.remotes['github.com/org/b'].time,
            list.remotes['github.com/org/b'].time
        );
        assert.equal(
            upstream.meta.remotes['github.com/org/c'].time,
            list.remotes['github.com/org/c'].time
        );
        assert.equal(
            upstream.meta.remotes['github.com/org/d'].time,
            list.remotes['github.com/org/d'].time
        );

        var now = Date.now();

        var text = list.toString();

        var expectedLines = [
            ['-', 'github.com/org/a', ago('a'), '-'],
            ['-', 'github.com/org/b', ago('b'), '-'],
            ['-', 'github.com/org/c', ago('c'), '-'],
            ['-', 'github.com/org/d', ago('d'), '-']
        ];
        var headers = ['', 'SERVICE', 'REGISTRY', 'LOCAL'].map(underline);
        expectedLines.unshift(headers);

        var expectedText = 'total 4 services\n' + textTable(expectedLines, {
            stringLength: stringLength
        });

        assert.equal(text, expectedText);

        function ago(letter) {
            var ts = upstream.meta.remotes['github.com/org/' + letter].time;
            var delta = now - (new Date(ts)).getTime();
            return timeAgo.ago(new Date(Date.now() - delta));
        }

        function underline(h) {
            return chalk.blue.underline(h);
        }

        tk.reset();

        assert.end();
    }
});

TestCluster.test('run `idl show`', {
}, function t(cluster, assert) {

    var stdout = mockStdout();

    cluster.idlGet('show github.com/org/a', function onShow(err) {
        if (err) {
            assert.ifError(err);
        }
        var expected = [
            'github.com/org/a/service.thrift',
            thriftIdl('A')
        ].join('\n') + '\n';
        assert.equal(stdout.get(), expected);
        stdout.restore();
        assert.end();
    });
});

TestCluster.test('run `idl version`', {
}, function t(cluster, assert) {
    cluster.idlGet('version', function onShow(err, stdout) {
        if (err) {
            assert.ifError(err);
        }
        /* eslint-disable global-require */
        var expected = require('../package.json').version;
        /* eslint-enable global-require */
        assert.equal(stdout, expected);
        assert.end();
    });
});

TestCluster.test('run `idl fetch`', {
}, function t(cluster, assert) {

    var now = Date.now();

    var fetch = fetchRemote(
        cluster,
        'github.com/org/b',
        now + 1000,
        true
    );

    fetch(onResults);

    function onResults(err, results) {
        if (err) {
            assert.ifError(err);
        }

        assert.equal(
            results.local.idl['github.com'].org.b['service.thrift'],
            results.upstream.files['idl/github.com/org/b/service.thrift'],
            'Correct IDL file contents'
        );

        assert.equal(
            results.local.idl['meta.json'].time,
            results.upstream.meta.remotes['github.com/org/b'].time
        );

        tk.reset();
        assert.end();
    }
});

/* eslint-disable */
var nyuckThrift = fs.readFileSync(__dirname + '/nyuck.thrift', 'utf8');
var joeThrift = fs.readFileSync(__dirname + '/joe.thrift', 'utf8');

TestCluster.test('run `idl fetch including dependencies`', {
    remoteRepos: {
        'stooges': {
            gitUrl: 'git@github.com:footeam/stooges',
            branch: 'master',
            files: {
                'idl': {
                    'github.com': {
                        'footeam': {
                            'stooges': {
                                'nyuck.thrift': nyuckThrift
                            }
                        }
                    }
                }
            }
        },
        'joe': {
            gitUrl: 'git@github.com:barteam/joe',
            branch: 'master',
            files: {
                'idl': {
                    'github.com': {
                        'barteam': {
                            'joe': {
                                'joe.thrift': joeThrift
                            }
                        },
                        'footeam': {
                            'stooges': {
                                'nyuck.thrift': nyuckThrift
                            }
                        }
                    }
                }
            }
        }
    }
}, function t(cluster, assert) {

    var now = Date.now();

    var fetch = fetchRemote(
        cluster,
        'github.com/barteam/joe',
        now + 1000,
        true
    );

    fetch(onResults);

    function onResults(err, results) {
        if (err) {
            assert.ifError(err);
        }

        assert.equal(
            results.local.idl['github.com'].barteam.joe['joe.thrift'],
            results.upstream.files['idl/github.com/barteam/joe/joe.thrift'],
            'Fetched the requested IDL file for barteam/joe'
        );

        assert.equal(
            results.local.idl['github.com'].footeam.stooges['nyuck.thrift'],
            results.upstream.files['idl/github.com/footeam/stooges/nyuck.thrift'],
            'Fetched the dependency for joe.thrift'
        );

        assert.equal(
            results.local.idl['meta.json'].time,
            results.upstream.meta.remotes['github.com/barteam/joe'].time
        );

        tk.reset();
        assert.end();
    }
});

TestCluster.test('run `idl publish`', {
    fetchRemotes: false
}, function t(cluster, assert) {

    var now = Date.now();

    series([
        publishRemote(cluster, 'A', now + 1000, false),
        publishRemote(cluster, 'A', now + 2000, false),
        updateRemote(cluster, 'A', now + 3000, false),
        publishRemote(cluster, 'A', now + 4000, false),
        deletedRemote(cluster, 'A', now + 5000, false),
        publishRemote(cluster, 'A', now + 6000, false)
    ], onResults);

    function onResults(err, results) {
        if (err) {
            assert.ifError(err);
        }

        var filepath = 'idl/github.com/org/a/service.thrift';
        assert.equal(
            results[0].upstream.files[filepath],
            thriftIdl('A'),
            'Correct published thrift file for service A (published ' +
                'for the first time)'
        );
        assert.equal(
            results[0].upstream.meta.version,
            now + 1000,
            'Correct version (published for the first time)'
        );
        assert.equal(
            results[1].upstream.files[filepath],
            thriftIdl('A'),
            'Correct published thrift file for service A (publish run ' +
                'again on unchanged thrift file)'
        );
        assert.equal(
            results[1].upstream.meta.version,
            now + 1000,
            'Correct version (version unchanged) (publish run again ' +
                'on unchanged thrift file)'
        );
        assert.equal(
            results[3].upstream.files[filepath],
            template(updatedThriftIdlTemplate, { remoteName: 'A' }),
            'Correct published thrift file for service A (publish run ' +
                'on changed thrift file)'
        );
        assert.equal(
            results[3].upstream.meta.version,
            now + 4000,
            'Correct version (version changed) (publish run on changed ' +
                'thrift file)'
        );
        assert.false(
            results[5].upstream.files.hasOwnProperty(filepath),
            'Unpublished thrift file for service A (publish run ' +
                'on deleted thrift file)'
        );
        assert.equal(
            results[5].upstream.meta.version,
            now + 6000,
            'Correct version (version changed) (publish run on deleted ' +
                'thrift file)'
        );

        tk.reset();
        assert.end();
    }
});

TestCluster.test('run `idl publish non-existent`', {
    fetchRemotes: false,
    remoteRepos: {
        'Z': {
            gitUrl: 'git@github.com:org/z',
            branch: 'master',
            files: {
                'idl': {
                    'github.com': {
                        'org': {
                            'a': {
                                'service.thrift': thriftIdl('A')
                            }
                        }
                    }
                }
            }
        }
    }
}, function t(cluster, assert) {

    var now = Date.now();

    series([
        publishRemote(cluster, 'A', now + 1000, false),
        publishRemote(cluster, 'Z', now + 2000, false)
    ], onResults);

    function onResults(err, results) {
        if (err) {
            assert.ifError(err);
        }

        var filepath = 'idl/github.com/org/z/service.thrift';
        assert.false(
            results[1].upstream.files.hasOwnProperty(filepath),
            'No published thrift file for service Z'
        );
        assert.equal(
            results[1].upstream.meta.version,
            now + 1000,
            'Correct version (unchanged)'
        );
        assert.equal(
            results[1].stderr.message,
            'Directory not found: ./idl/github.com/org/z'
        );

        tk.reset();
        assert.end();
    }
});

TestCluster.test('run `idl update`', {
    fetchRemotes: false
}, function t(cluster, assert) {

    var now = Date.now();

    series([
        publishRemote(cluster, 'A', now + 1000, false),
        publishRemote(cluster, 'B', now + 2000, false),
        fetchRemote(cluster, 'github.com/org/a', now + 3000, true),
        fetchRemote(cluster, 'github.com/org/b', now + 4000, true),
        updateRemote(cluster, 'A', now + 5000, true),
        publishRemote(cluster, 'A', now + 6000, false),
        updateRemote(cluster, 'B', now + 7000, true),
        publishRemote(cluster, 'B', now + 8000, false),
        updateLocal(cluster, now + 9000, true)
    ], onResults);

    function onResults(err, data) {
        if (err) {
            assert.ifError(err);
        }

        // Only A published
        assert.equal(
            data[0].upstream.files['idl/github.com/org/a/service.thrift'],
            thriftIdl('A'),
            'Correct thrift A file'
        );

        assert.equal(
            data[0].upstream.meta.version,
            now + 1000,
            'Correct version'
        );

        // A and B published
        assert.equal(
            data[1].upstream.files['idl/github.com/org/a/service.thrift'],
            thriftIdl('A'),
            'Correct thrift A file'
        );

        assert.equal(
            data[1].upstream.files['idl/github.com/org/b/service.thrift'],
            thriftIdl('B'),
            'Correct thrift B file'
        );

        assert.equal(
            data[1].upstream.meta.version,
            now + 2000,
            'Correct version'
        );

        // Fetch A locally
        assert.equal(
            data[2].local.idl['github.com'].org.a['service.thrift'],
            thriftIdl('A'),
            'Correct thrift A file locally'
        );

        assert.equal(
            data[2].local.idl['meta.json'].version,
            now + 1000,
            'Correct meta.json version'
        );

        assert.equal(
            data[2].local.idl['meta.json'].remotes['github.com/org/a'].time,
            (new Date(now + 1000)).toISOString(),
            'Correct version of A'
        );

        // Fetch B locally
        assert.equal(
            data[3].local.idl['github.com'].org.b['service.thrift'],
            thriftIdl('B'),
            'Correct thrift B file locally'
        );

        assert.equal(
            data[3].local.idl['meta.json'].version,
            now + 2000,
            'Correct meta.json version'
        );

        assert.equal(
            data[3].local.idl['meta.json'].remotes['github.com/org/b'].time,
            (new Date(now + 2000)).toISOString(),
            'Correct version of B'
        );

        assert.equal(
            data[3].local.idl['meta.json'].remotes['github.com/org/a'].time,
            (new Date(now + 1000)).toISOString(),
            'Correct version of A'
        );

        // Remote A and B updated and published. Update run.
        assert.equal(
            data[8].local.idl['github.com'].org.a['service.thrift'],
            template(updatedThriftIdlTemplate, { remoteName: 'A' }),
            'Correct thrift A file locally'
        );

        assert.equal(
            data[8].local.idl['github.com'].org.b['service.thrift'],
            template(updatedThriftIdlTemplate, { remoteName: 'B' }),
            'Correct thrift B file locally'
        );

        assert.equal(
            data[8].local.idl['meta.json'].version,
            now + 8000,
            'Correct meta.json version'
        );

        assert.equal(
            data[8].local.idl['meta.json'].remotes['github.com/org/b'].time,
            (new Date(now + 8000)).toISOString(),
            'Correct version of B'
        );

        assert.equal(
            data[8].local.idl['meta.json'].remotes['github.com/org/a'].time,
            (new Date(now + 6000)).toISOString(),
            'Correct version of A'
        );

        tk.reset();
        assert.end();
    }
});

TestCluster.test('run `idl update` with corrupt meta.json', {
}, function t(cluster, assert) {

    var now = Date.now();

    series([
        fetchRemote(cluster, 'github.com/org/a', now + 2000, false),
        corruptMetaJson(cluster, now + 3000),
        updateLocal(cluster, now + 4000, false)
    ], onResults);

    function onResults(err, data) {
        if (err) {
            assert.ifError(err);
        }
        var expected = 'Corrupt meta.json file: Unexpected end of input';
        assert.equal(
            data[2].stderr.message,
            expected,
            'Warn user about corrupt meta'
        );
        tk.reset();
        assert.end();
    }
});

function corruptMetaJson(cluster, time) {
    return function corrupt(callback) {
        tk.freeze(new Date(time));
        var metaPath = path.join(cluster.localApp, 'idl', 'meta.json');
        fs.readFile(metaPath, 'utf8', onRawMetaJson);

        function onRawMetaJson(err, rawJson) {
            if (err) {
                return callback(err);
            }
            var lines = rawJson.split('\n');
            rawJson = lines.slice(0, lines.length - 2).join('\n');
            fs.writeFile(metaPath, rawJson, 'utf8', callback);
        }
    };
}

function fetchRemote(cluster, remoteId, time, inspectLocal) {
    return function fetch(callback) {
        tk.freeze(new Date(time));
        cluster.idlFetch(
            remoteId,
            inspectBoth(cluster, inspectLocal, callback)
        );
    };
}

function publishRemote(cluster, remoteName, time, inspectLocal) {
    return function publish(callback) {
        tk.freeze(new Date(time));
        cluster.idlPublish(
            path.join(cluster.remotesDir, remoteName),
            inspectBoth(cluster, inspectLocal, callback)
        );
    };
}

function updateRemote(cluster, remoteName, time, inspectLocal) {
    var fixtures = {
        idl: {
            'github.com': {
                'org': {}
            }
        }
    };

    fixtures.idl['github.com'].org[remoteName.toLowerCase()] = {
        'service.thrift': template(updatedThriftIdlTemplate, {
            remoteName: remoteName
        })
    };

    return function update(callback) {
        tk.freeze(new Date(time));
        cluster.updateRemote(
            remoteName,
            fixtures,
            inspectBoth(cluster, inspectLocal, callback)
        );
    };
}

function deletedRemote(cluster, remoteName, time, inspectLocal) {
    var fixtures = {
        idl: {
            'github.com': {
                'org': {}
            }
        }
    };

    fixtures.idl['github.com'].org[remoteName.toLowerCase()] = {};

    return function update(callback) {
        tk.freeze(new Date(time));
        cluster.updateRemote(
            remoteName,
            fixtures,
            inspectBoth(cluster, inspectLocal, callback)
        );
    };
}

function updateLocal(cluster, time, inspectLocal) {
    return function update(callback) {
        tk.freeze(new Date(time));
        cluster.idlUpdate(inspectBoth(cluster, inspectLocal, callback));
    };
}

function inspectBoth(cluster, inspectLocal, callback) {
    var stdout;
    var stderr;

    return function inspect(err, text) {
        var tasks = {
            upstream: cluster.inspectUpstream.bind(cluster)
        };
        if (inspectLocal) {
            tasks.local = cluster.inspectLocalApp.bind(cluster);
        }
        stderr = err;
        stdout = text;
        parallel(tasks, onResults);
    };

    function onResults(err, results) {
        if (err) {
            return callback(err);
        }
        if (results &&
            results.local &&
            results.local.idl &&
            results.local.idl['meta.json']) {
            results.local.idl['meta.json'] = JSON.parse(
                results.local.idl['meta.json']
            );
        }

        results.stdout = stdout;
        results.stderr = stderr;

        callback(null, results);
    }
}

function mockStdout(type) {
    type = type || 'stdout';
    var oldStdout = process[type].write;
    var stdout = '';

    function fakeWriter(str) {
        stdout += str;
    }

    process[type].write = (function wrapWrite(write) {
        return function wrappedWrite(string, encoding, fd) {
            // var args = Array.prototype.slice.apply(arguments);
            // write.apply(process.stdout, args);
            fakeWriter.call(fakeWriter, string);
        };
    }(process[type].write));

    function restoreStdout() {
        process[type].write = oldStdout;
    }

    function getStdout() {
        return stdout;
    }

    return {
        get: getStdout,
        restore: restoreStdout
    };
}
