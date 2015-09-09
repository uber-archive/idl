'use strict';

var parallel = require('run-parallel');
var series = require('run-series');
var path = require('path');
var thriftIdl = require('./lib/thrift-idl');

var TestCluster = require('./lib/test-cluster.js');

TestCluster.test('run `thrift-store list`', {}, function t(cluster, assert) {
    parallel({
        list: cluster.thriftGet.bind(cluster, 'list'),
        upstream: cluster.inspectUpstream.bind(cluster)
    }, onResults);

    function onResults(err, data) {
        if (err) {
            assert.ifError(err);
        }

        var list = data.list;
        var upstream = data.upstream;

        assert.equal(
            upstream.meta.remotes.A.time, list.remotes.A.time
        );
        assert.equal(
            upstream.meta.remotes.B.time, list.remotes.B.time
        );
        assert.equal(
            upstream.meta.remotes.C.time, list.remotes.C.time
        );
        assert.equal(
            upstream.meta.remotes.D.time, list.remotes.D.time
        );

        var text = list.toString();

        assert.equal(text, '' +
            ' - A                 ' + upstream.meta.remotes.A.time + '\n' +
            ' - github.com/org/a  ' + upstream.meta.remotes['github.com/org/a']
                .time + '\n' +
            ' - B                 ' + upstream.meta.remotes.B.time + '\n' +
            ' - github.com/org/b  ' + upstream.meta.remotes['github.com/org/b']
                .time + '\n' +
            ' - C                 ' + upstream.meta.remotes.C.time + '\n' +
            ' - github.com/org/c  ' + upstream.meta.remotes['github.com/org/c']
                .time + '\n' +
            ' - D                 ' + upstream.meta.remotes.D.time + '\n' +
            ' - github.com/org/d  ' + upstream.meta.remotes['github.com/org/d']

                .time
        );

        assert.end();
    }
});

TestCluster.test('run `thrift-store fetch`', {}, function t(cluster, assert) {
    parallel({
        upstream: cluster.inspectUpstream.bind(cluster),
        fetch: series.bind(null, [
            cluster.thriftGet.bind(cluster, 'fetch B'),
            cluster.inspectLocalApp.bind(cluster)
        ])
    }, onResults);

    function onResults(err, data) {
        if (err) {
            assert.ifError(err);
        }

        var upstream = data.upstream;
        assert.equal(data.fetch[0], undefined);
        var files = data.fetch[1];

        var meta = JSON.parse(files.thrift['meta.json']);

        assert.equal(meta.time, upstream.meta.remotes.B.time);
        assert.equal(meta.version,
            new Date(upstream.meta.remotes.B.time).getTime()
        );
        assert.deepEqual(meta.remotes.B, upstream.meta.remotes.B);

        assert.equal(
            files.thrift['B.thrift'], upstream.remotes.B
        );

        assert.end();
    }
});

TestCluster.test('run `thrift-store install`', {
}, function t(cluster, assert) {

    series([
        cluster.thriftStoreInstall.bind(cluster, 'github.com/org/b'),
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
            localApp.thrift['github.com'].org.b['service.thrift'];
        var installedMetaFile =
            JSON.parse(localApp.thrift['github.com'].org.b['meta.json']);
        // var localAppMetaFile = JSON.parse(localApp.thrift['meta.json']);

        assert.equal(
            installedThriftFile,
            upstream.files['thrift/github.com/org/b/service.thrift'],
            'Correct thrift file installed'
        );
        assert.deepEqual(
            installedMetaFile.shasums,
            upstream.meta.remotes['github.com/org/b'].shasums,
            'Correct files and shasums for installed module'
        );

        assert.end();
    }
});

TestCluster.test('run `thrift-store publish`', {
    fetchRemotes: false
}, function t(cluster, assert) {

    var tasks = Object.keys(cluster.remoteRepos).map(makePublishThunk);

    function makePublishThunk(remoteKey) {
        return function publishThunk(callback) {
            var cwd = path.join(cluster.remotesDir, remoteKey);
            cluster.thriftStorePublish(cwd, callback);
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
            var filepath = 'thrift/github.com/org/' + key.toLowerCase() +
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

TestCluster.test('run `thrift-store update`', {}, function t(cluster, assert) {
    var thriftIdlContent = '' +
        'service B {\n' +
        '    i32 echo(1:i32 value)\n' +
        '    i64 echo64(1:i64 value)\n' +
        '}\n';

    series([
        cluster.thriftGet.bind(cluster, 'fetch D'),
        cluster.thriftGet.bind(cluster, 'fetch B')
    ], onAdded);

    function onAdded(err) {
        if (err) {
            assert.ifError(err);
        }

        cluster.updateRemote('B', {
            thrift: {
                'service.thrift': thriftIdlContent,
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
        cluster.thriftGod.once('fetchedRemotes', onRemotes);
    }

    function onRemotes() {
        cluster.thriftGet('update', onUpdate);
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

        var meta = JSON.parse(local.thrift['meta.json']);

        assert.equal(meta.time, upstream.meta.remotes.B.time);
        assert.equal(meta.version,
            new Date(upstream.meta.remotes.B.time).getTime()
        );

        assert.deepEqual(meta.remotes.B, upstream.meta.remotes.B);
        assert.deepEqual(meta.remotes.D, upstream.meta.remotes.D);

        assert.equal(local.thrift['B.thrift'], upstream.remotes.B);
        assert.equal(local.thrift['D.thrift'], upstream.remotes.D);

        assert.end();
    }
});
