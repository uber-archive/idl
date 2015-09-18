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

var thriftIdl = require('./lib/thrift-idl');
var TestCluster = require('./lib/test-cluster.js');

TestCluster.test('run `idl list`', {
}, function t(cluster, assert) {
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

        var text = list.toString();

        assert.equal(
            text,
            ' - github.com/org/a  ' + upstream.meta.remotes['github.com/org/a']
                .time + '\n' +
            ' - github.com/org/b  ' + upstream.meta.remotes['github.com/org/b']
                .time + '\n' +
            ' - github.com/org/c  ' + upstream.meta.remotes['github.com/org/c']
                .time + '\n' +
            ' - github.com/org/d  ' + upstream.meta.remotes['github.com/org/d']
                .time
        );

        assert.end();
    }
});

TestCluster.test('run `idl install`', {
}, function t(cluster, assert) {

    series([
        cluster.idlInstall.bind(cluster, 'github.com/org/b'),
        parallel.bind(null, {
            upstream: cluster.inspectUpstream.bind(cluster),
            localApp: cluster.inspectLocalApp.bind(cluster)
        })
    ], onResults);

    function onResults(err, results) {
        if (err) {
            assert.ifError(err);
        }
        var localApp = results[1].localApp;
        var upstream = results[1].upstream;

        var installedThriftFile =
            localApp.idl['github.com'].org.b['service.thrift'];
        var localAppMetaFile = JSON.parse(localApp.idl['meta.json']);

        assert.equal(
            installedThriftFile,
            upstream.files['idl/github.com/org/b/service.thrift'],
            'Correct IDL file contents'
        );

        assert.equal(
            localAppMetaFile.time,
            upstream.meta.remotes['github.com/org/b'].time
        );

        assert.end();
    }
});

TestCluster.test('run `idl publish`', {
    fetchRemotes: false
}, function t(cluster, assert) {

    var tasks = Object.keys(cluster.remoteRepos).map(makePublishThunk);

    function makePublishThunk(remoteKey) {
        return function publishThunk(callback) {
            var cwd = path.join(cluster.remotesDir, remoteKey);
            cluster.idlPublish(cwd, callback);
        };
    }

    series([
        series.bind(null, tasks),
        cluster.inspectUpstream.bind(cluster)
    ], onResults);

    function onResults(err, results) {
        if (err) {
            assert.ifError(err);
        }

        var upstream = results[1];

        Object.keys(cluster.remoteRepos).forEach(testPublish);

        function testPublish(key) {
            var filepath = 'idl/github.com/org/' + key.toLowerCase() +
                '/service.thrift';
            assert.equal(
                upstream.files[filepath],
                thriftIdl(key.toUpperCase()),
                'Correct published thrift file for service ' + key.toUpperCase()
            );
        }

        assert.end();
    }
});

TestCluster.test('run `idl update`', {
}, function t(cluster, assert) {
    var thriftIdlContent = '' +
        'service B {\n' +
        '    i32 echo(1:i32 value)\n' +
        '    i64 echo64(1:i64 value)\n' +
        '}\n';

    series([
        cluster.idlGet.bind(cluster, 'install github.com/org/d'),
        cluster.idlGet.bind(cluster, 'install github.com/org/b')
    ], onAdded);

    function onAdded(err) {
        if (err) {
            assert.ifError(err);
        }

        cluster.updateRemote('B', {
            idl: {
                'github.com': {
                    'org': {
                        'b': {
                            'service.thrift': thriftIdlContent
                        }
                    }
                }
            }
        }, onUpdated);
    }

    function onUpdated(err) {
        if (err) {
            assert.ifError(err);
        }

        cluster.timers.advance(30 * 1000 + 5);
        cluster.idlDaemon.once('fetchedRemotes', onRemotes);
    }

    function onRemotes() {
        cluster.idlGet('update', onUpdate);
    }

    function onUpdate(err) {
        if (err) {
            assert.ifError(err);
        }

        parallel({
            upstream: cluster.inspectUpstream.bind(cluster),
            local: cluster.inspectLocalApp.bind(cluster)
        }, onInspect);
    }

    function onInspect(err, data) {
        if (err) {
            assert.ifError(err);
        }

        var local = data.local;
        var upstream = data.upstream;

        var localMeta = JSON.parse(local.idl['meta.json']);

        assert.equal(
            localMeta.time,
            upstream.meta.remotes['github.com/org/b'].time
        );
        assert.equal(
            localMeta.version,
            new Date(upstream.meta.remotes['github.com/org/b'].time).getTime()
        );

        assert.deepEqual(
            localMeta.remotes['github.com/org/b'],
            upstream.meta.remotes['github.com/org/b']
        );
        assert.deepEqual(
            localMeta.remotes['github.com/org/d'],
            upstream.meta.remotes['github.com/org/d']
        );

        assert.equal(
            local.idl['github.com'].org.b['service.thrift'],
            upstream.files['idl/github.com/org/b/service.thrift']
        );
        assert.equal(
            local.idl['github.com'].org.d['service.thrift'],
            upstream.files['idl/github.com/org/d/service.thrift']
        );

        assert.equal(
            local.idl['github.com'].org.b['service.thrift'],
            thriftIdlContent,
            'Updated IDL has correct newer IDL content'
        );

        assert.end();
    }
});
