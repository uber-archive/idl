'use strict';

var parallel = require('run-parallel');
var series = require('run-series');

var TestCluster = require('./lib/test-cluster.js');

TestCluster.test('run thrift-get list', {
    config: {}
}, function t(cluster, assert) {
    parallel({
        list: cluster.thriftGet.bind(cluster, 'list'),
        upstream: cluster.inspectUpstream.bind(cluster)
    }, onResults);

    function onResults(err, data) {
        assert.ifError(err);

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
            ' - A  ' + upstream.meta.remotes.A.time + '\n' +
            ' - B  ' + upstream.meta.remotes.B.time + '\n' +
            ' - C  ' + upstream.meta.remotes.C.time + '\n' +
            ' - D  ' + upstream.meta.remotes.D.time
        );

        assert.end();
    }
});

TestCluster.test('run thrift-get add', {
    config: {}
}, function t(cluster, assert) {
    parallel({
        upstream: cluster.inspectUpstream.bind(cluster),
        add: series.bind(null, [
            cluster.thriftGet.bind(cluster, 'add B'),
            cluster.inspectLocalApp.bind(cluster)
        ])
    }, onResults);

    function onResults(err, data) {
        assert.ifError(err);

        var upstream = data.upstream;
        assert.equal(data.add[0], undefined);
        var files = data.add[1];

        var meta = JSON.parse(files.thrift['meta.json']);
        // console.log('upstream', upstream.meta);

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

TestCluster.test('run thrift-get update', {
    config: {}
}, function t(cluster, assert) {
    series([
        cluster.thriftGet.bind(cluster, 'add D'),
        cluster.thriftGet.bind(cluster, 'add B')
    ], onAdded)

    function onAdded(err) {
        assert.ifError(err);

        cluster.updateRemote('B', {
            thrift: {
                'service.thrift': '' +
                    'service B {\n' +
                    '    i32 echo(1:i32 value)\n' +
                    '    i64 echo64(1:i64 value)\n' +
                    '}\n'
            }
        }, onUpdated);
    }

    function onUpdated(err) {
        assert.ifError(err);

        cluster.timers.advance(30 * 1000 + 5);
        cluster.thriftGod.once('fetchedRemotes', onRemotes);
    }

    function onRemotes() {
        cluster.thriftGet('update', onUpdate);
    }

    function onUpdate(err) {
        assert.ifError(err);

        parallel({
            upstream: cluster.inspectUpstream.bind(cluster),
            local: cluster.inspectLocalApp.bind(cluster)
        }, onInspect);
    }

    function onInspect(err, data) {
        assert.ifError(err);

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
