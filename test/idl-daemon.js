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

var TestCluster = require('./lib/test-cluster');
var defineFixture = require('./lib/define-fixture');
var thriftIdl = require('./lib/thrift-idl');

TestCluster.test('run the idl-daemon', {
}, function t(cluster, assert) {
    cluster.inspectUpstream(onUpstream);

    function onUpstream(err, data) {
        if (err) {
            assert.ifError(err);
        }

        assert.deepEqual(
            Object.keys(data.files).sort(),
            [
                'idl/github.com/org/a/service.thrift',
                'idl/github.com/org/b/service.thrift',
                'idl/github.com/org/c/service.thrift',
                'idl/github.com/org/d/service.thrift',
                'meta.json'
            ],
            'Upstream contains all expected files'
        );

        assert.equal(data.gitlog,
            'Updating D to latest version\n' +
            'Updating C to latest version\n' +
            'Updating B to latest version\n' +
            'Updating A to latest version\n' +
            'initial\n',
            'Correct git log contents'
        );

        assert.equal(
            data.meta.time,
            data.meta.remotes['github.com/org/d'].time,
            'Correct timestamp on last update'
        );
        assert.equal(
            new Date(data.meta.time).getTime(),
            data.meta.version,
            'Version is correct and is a timestamp'
        );

        assert.deepEqual(
            data.meta.remotes['github.com/org/a'].shasums,
            {
                'service.thrift': 'd329c8c24d0871076a5f05180a439bccb9bebe71'
            },
            'Correct shasums for remote A'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/b'].shasums,
            {
                'service.thrift': '424a6ca9b4660bf432045eeba7a3254ab38d5701'
            },
            'Correct shasums for remote B'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/c'].shasums,
            {
                'service.thrift': '484742978a072e46ae1131d8efe7fe0377d35c54'
            },
            'Correct shasums for remote C'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/d'].shasums,
            {
                'service.thrift': 'cf9c2141b3dbb05bcbaa31579b883697d42c7f8d'
            },
            'Correct shasums for remote D'
        );

        assert.equal(
            data.files['idl/github.com/org/a/service.thrift'],
            thriftIdl('A'),
            'Correct thrift definition for A'
        );

        assert.equal(
            data.files['idl/github.com/org/b/service.thrift'],
            thriftIdl('B'),
            'Correct thrift definition for B'
        );

        assert.equal(
            data.files['idl/github.com/org/c/service.thrift'],
            thriftIdl('C'),
            'Correct thrift definition for C'
        );

        assert.equal(
            data.files['idl/github.com/org/d/service.thrift'],
            thriftIdl('D'),
            'Correct thrift definition for D'
        );

        var remotes = data.meta.remotes;
        assert.equal(data.gittag, '' +
            'v' + new Date(remotes['github.com/org/a'].time).getTime() + '\n' +
            'v' + new Date(remotes['github.com/org/b'].time).getTime() + '\n' +
            'v' + new Date(remotes['github.com/org/c'].time).getTime() + '\n' +
            'v' + new Date(remotes['github.com/org/d'].time).getTime() + '\n'
        );

        assert.end();
    }
});

TestCluster.test('run with branches', {
    remoteRepos: {
        'E': defineFixture({
            name: 'E',
            branch: 'foo'
        })
    }
}, function t(cluster, assert) {
    cluster.inspectUpstream(onUpstream);

    function onUpstream(err, data) {
        if (err) {
            assert.ifError(err);
        }

        assert.deepEqual(
            Object.keys(data.files).sort(),
            [
                'idl/github.com/org/a/service.thrift',
                'idl/github.com/org/b/service.thrift',
                'idl/github.com/org/c/service.thrift',
                'idl/github.com/org/d/service.thrift',
                'idl/github.com/org/e/service.thrift',
                'meta.json'
            ],
            'Upstream contains all expected files'
        );

        assert.equal(
            data.files['idl/github.com/org/e/service.thrift'],
            thriftIdl('E')
        );
        assert.end();
    }
});

TestCluster.test('running idl-daemon twice', {
    prepareOnly: true
}, function t(cluster, assert) {
    cluster.setupIDLDaemon(onSetup);

    function onSetup(err) {
        if (err) {
            assert.ifError(err);
        }

        cluster.setupIDLDaemon(onSetup2);
    }

    function onSetup2(err) {
        if (err) {
            assert.ifError(err);
        }

        cluster.inspectUpstream(onUpstream);
    }

    function onUpstream(err, data) {
        if (err) {
            assert.ifError(err);
        }

        assert.deepEqual(
            Object.keys(data.files).sort(),
            [
                'idl/github.com/org/a/service.thrift',
                'idl/github.com/org/b/service.thrift',
                'idl/github.com/org/c/service.thrift',
                'idl/github.com/org/d/service.thrift',
                'meta.json'
            ],
            'Upstream contains all expected files'
        );

        assert.equal(data.gitlog,
            'Updating D to latest version\n' +
            'Updating C to latest version\n' +
            'Updating B to latest version\n' +
            'Updating A to latest version\n' +
            'initial\n'
        );

        assert.equal(data.meta.time,
            data.meta.remotes['github.com/org/d'].time);
        assert.equal(new Date(data.meta.time).getTime(),
            data.meta.version);

        assert.deepEqual(
            data.meta.remotes['github.com/org/a'].shasums,
            {
                'service.thrift': 'd329c8c24d0871076a5f05180a439bccb9bebe71'
            },
            'Correct shasums for remote A'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/b'].shasums,
            {
                'service.thrift': '424a6ca9b4660bf432045eeba7a3254ab38d5701'
            },
            'Correct shasums for remote B'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/c'].shasums,
            {
                'service.thrift': '484742978a072e46ae1131d8efe7fe0377d35c54'
            },
            'Correct shasums for remote C'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/d'].shasums,
            {
                'service.thrift': 'cf9c2141b3dbb05bcbaa31579b883697d42c7f8d'
            },
            'Correct shasums for remote D'
        );

        assert.end();
    }
});

TestCluster.test('updating a remote', {
}, function t(cluster, assert) {

    var thriftIdlContent = '' +
        'service B {\n' +
        '    i32 echo(1:i32 value)\n' +
        '    i64 echo64(1:i64 value)\n' +
        '}\n';

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

    function onUpdated(err) {
        if (err) {
            assert.ifError(err);
        }

        cluster.timers.advance(30 * 1000 + 5);
        cluster.idlDaemon.once('fetchedRemotes', onRemotes);
    }

    function onRemotes() {
        cluster.inspectUpstream(onUpstream);
    }

    function onUpstream(err, data) {
        if (err) {
            assert.ifError(err);
        }

        assert.equal(data.gitlog,
            'Updating B to latest version\n' +
            'Updating D to latest version\n' +
            'Updating C to latest version\n' +
            'Updating B to latest version\n' +
            'Updating A to latest version\n' +
            'initial\n'
        );

        assert.equal(data.meta.time,
            data.meta.remotes['github.com/org/b'].time);
        assert.equal(new Date(data.meta.time).getTime(),
            data.meta.version);

        assert.deepEqual(
            Object.keys(data.files).sort(),
            [
                'idl/github.com/org/a/service.thrift',
                'idl/github.com/org/b/service.thrift',
                'idl/github.com/org/c/service.thrift',
                'idl/github.com/org/d/service.thrift',
                'meta.json'
            ],
            'Upstream contains all expected files'
        );

        assert.deepEqual(
            data.meta.remotes['github.com/org/a'].shasums,
            {
                'service.thrift': 'd329c8c24d0871076a5f05180a439bccb9bebe71'
            },
            'Correct shasums for remote A'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/b'].shasums,
            {
                'service.thrift': 'e1359a7f03df1988e8c11b85fe7b59df16ee2806'
            },
            'Correct shasums for remote B'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/c'].shasums,
            {
                'service.thrift': '484742978a072e46ae1131d8efe7fe0377d35c54'
            },
            'Correct shasums for remote C'
        );
        assert.deepEqual(
            data.meta.remotes['github.com/org/d'].shasums,
            {
                'service.thrift': 'cf9c2141b3dbb05bcbaa31579b883697d42c7f8d'
            },
            'Correct shasums for remote D'
        );

        assert.equal(
            data.files['idl/github.com/org/a/service.thrift'],
            thriftIdl('A'),
            'Correct thrift definition for A'
        );

        assert.equal(
            data.files['idl/github.com/org/b/service.thrift'],
            thriftIdlContent,
            'Correct thrift definition for B'
        );

        assert.equal(
            data.files['idl/github.com/org/c/service.thrift'],
            thriftIdl('C'),
            'Correct thrift definition for C'
        );

        assert.equal(
            data.files['idl/github.com/org/d/service.thrift'],
            thriftIdl('D'),
            'Correct thrift definition for D'
        );

        var remotes = data.meta.remotes;
        var tags = data.gittag.trim().split('\n');

        assert.equal(tags[0], 'v' + new Date(remotes['github.com/org/a'].time)
            .getTime());
        assert.equal(tags[2], 'v' + new Date(remotes['github.com/org/c'].time)
            .getTime());
        assert.equal(tags[3], 'v' + new Date(remotes['github.com/org/d'].time)
            .getTime());
        assert.equal(tags[4], 'v' + new Date(remotes['github.com/org/b'].time)
            .getTime());

        assert.end();
    }
});
