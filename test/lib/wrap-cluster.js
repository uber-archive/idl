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

module.exports = wrapCluster;

function wrapCluster(tape, Cluster) {
    var test = buildTester(tape);

    test.only = buildTester(tape.only);
    test.skip = buildTester(tape.skip);

    return test;

    function buildTester(testFn) {
        return test;

        function test(testName, options, fn) {
            if (typeof opts === 'function') {
                fn = options;
                options = {};
            }

            if (!fn) {
                return testFn(testName);
            }

            testFn(testName, onAssert);

            function onAssert(assert) {
                var _end = assert.end;
                assert.end = asyncEnd;

                var cluster = Cluster(options);
                cluster.bootstrap(onCluster);

                function onCluster(err) {
                    if (err) {
                        return assert.end(err);
                    }

                    fn(cluster, assert);
                }

                function asyncEnd(err) {
                    if (err) {
                        assert.ifError(err);
                    }

                    cluster.destroy(onEnd);

                    function onEnd(err2) {
                        if (err2) {
                            assert.ifError(err2);
                        }

                        _end.call(assert);
                    }
                }
            }
        }
    }
}
