'use strict';

var TestCluster = require('./lib/test-cluster.js');

TestCluster.test('run the thrift-god', {
    config: {}
}, function t(cluster, assert) {
    cluster.inspectUpstream(onUpstream);

    function onUpstream(err, data) {
        assert.ifError(err);

        assert.equal(data.thrift,
            'tree HEAD:thrift\n' +
            '\n' +
            'A.thrift\n' +
            'B.thrift\n' +
            'C.thrift\n' +
            'D.thrift\n'
        );
        assert.equal(data.gitlog,
            'Updating D to latest version ' +
                'cf9c2141b3dbb05bcbaa31579b883697d42c7f8d\n' +
            'Updating C to latest version ' +
                '484742978a072e46ae1131d8efe7fe0377d35c54\n' +
            'Updating B to latest version ' +
                '424a6ca9b4660bf432045eeba7a3254ab38d5701\n' +
            'Updating A to latest version ' +
                'd329c8c24d0871076a5f05180a439bccb9bebe71\n' +
            'initial\n'
        );

        assert.equal(data.meta.time,
            data.meta.remotes.D.time);
        assert.equal(new Date(data.meta.time).getTime(),
            data.meta.version);

        assert.equal(data.meta.remotes.A.sha,
            'd329c8c24d0871076a5f05180a439bccb9bebe71');
        assert.equal(data.meta.remotes.B.sha,
            '424a6ca9b4660bf432045eeba7a3254ab38d5701');
        assert.equal(data.meta.remotes.C.sha,
            '484742978a072e46ae1131d8efe7fe0377d35c54');
        assert.equal(data.meta.remotes.D.sha,
            'cf9c2141b3dbb05bcbaa31579b883697d42c7f8d');

        assert.deepEqual(data.remotes, {
            'A':
                'service A {\n' +
                '    i32 echo(1:i32 value)\n' +
                '}\n',
            'B':
                'service B {\n' +
                '    i32 echo(1:i32 value)\n' +
                '}\n',
            'C':
                'service C {\n' +
                '    i32 echo(1:i32 value)\n' +
                '}\n',
            'D':
                'service D {\n' +
                '    i32 echo(1:i32 value)\n' +
                '}\n'
        });

        assert.end();
    }
});

TestCluster.test('run with branches', {
    remoteRepos: {
        'E': {
            branch: 'foo',
            files: {
                'thrift': {
                    'service.thrift': '' +
                        'service E {\n' +
                        '    i32 echo(1:i32 value)\n' +
                        '}\n'
                }
            }
        }
    },
    config: {}
}, function t(cluster, assert) {
    cluster.inspectUpstream(onUpstream);

    function onUpstream(err, data) {
        assert.ifError(err);

        assert.equal(data.thrift,
            'tree HEAD:thrift\n' +
            '\n' +
            'A.thrift\n' +
            'B.thrift\n' +
            'C.thrift\n' +
            'D.thrift\n' +
            'E.thrift\n'
        );

        assert.equal(
            data.remotes.E,
            'service E {\n' +
            '    i32 echo(1:i32 value)\n' +
            '}\n'
        );

        assert.end();
    }
});
