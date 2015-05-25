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
                'f700f70c8e1744cbe85ce3ab1c2ef04d09fc2a0a\n' +
            'Updating C to latest version ' +
                '65329cc064c23524c837ef8fe944664cad6052f1\n' +
            'Updating B to latest version ' +
                'd384fde576144a426d3af3d939866bd6716314f9\n' +
            'Updating A to latest version ' +
                'b20915b60213b0a5d4923444d803aa3fb3e36717\n' +
            'initial\n'
        );

        assert.equal(data.meta.time,
            data.meta.remotes.D.time);
        assert.equal(new Date(data.meta.time).getTime(),
            data.meta.version);

        assert.equal(data.meta.remotes.A.sha,
            'b20915b60213b0a5d4923444d803aa3fb3e36717');
        assert.equal(data.meta.remotes.B.sha,
            'd384fde576144a426d3af3d939866bd6716314f9');
        assert.equal(data.meta.remotes.C.sha,
            '65329cc064c23524c837ef8fe944664cad6052f1');
        assert.equal(data.meta.remotes.D.sha,
            'f700f70c8e1744cbe85ce3ab1c2ef04d09fc2a0a');

        assert.deepEqual(data.remotes, {
            'A':
                'service A {\n' +
                '   i32 echo(1:i32 value)\n' +
                '}\n',
            'B':
                'service B {\n' +
                '   i32 echo(1:i32 value)\n' +
                '}\n',
            'C':
                'service C {\n' +
                '   i32 echo(1:i32 value)\n' +
                '}\n',
            'D':
                'service D {\n' +
                '   i32 echo(1:i32 value)\n' +
                '}\n'
        });

        assert.end();
    }
});
