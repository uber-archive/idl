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
