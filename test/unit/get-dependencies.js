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

var test = require('tape');
var path = require('path');
var mkdirp = require('mkdirp');
var withFixtures = require('fixtures-fs');

var thriftIdl = require('../lib/thrift-idl').thriftIdl;
var getDependencies = require('../../get-dependencies');

var fixturesPath = path.resolve(__dirname, '../fixtures');
var fixtures = {
    idl: {
        'github.com': {
            'a-team': {
                foo: {
                    'foo.thrift': [
                        'include "../bar/bar.thrift"',
                        'include "../../b-team/baz/bar.thrift"',
                        'include "../../b-team/qux/qux.thrift"',
                        'include "../../company/common/common.thrift"',
                        thriftIdl('Foo')
                    ].join('\n'),
                    // multiple files in the same folder
                    'otherfoo.thrift': [
                        'include "../../company/common/common.thrift"'
                    ].join('\n')
                },
                bar: {
                    'bar.thrift': thriftIdl('Bar')
                }
            },
            'b-team': {
                baz: {
                    'baz.thrift': [
                        'include "../../company/common/common.thrift"',
                        thriftIdl('Baz')
                    ].join('\n')
                },
                qux: {
                    'qux.thrift': [
                        'include "../../company/common/common.thrift"',
                        thriftIdl('Qux')
                    ].join('\n')
                }
            },
            company: {
                common: {
                    'common.thrift': thriftIdl('Common')
                }
            }
        },
        'meta.json': ''
    }
};

test('setup', function t(assert) {
    // race-condition in fixtures-fs can cause mkdir to fail
    // when mkdir /fixtures/idl is called before mkdir/fixtures
    mkdirp.sync(fixturesPath);
    assert.end();
});

test('getServiceDependenciesFromIncludes',
    withFixtures(fixturesPath, fixtures, function t(assert) {
        getDependencies(
            path.resolve(__dirname, '../fixtures/idl'),
            'github.com/a-team/foo',
            onIncludes
        );

        function onIncludes(err, serviceDependencies) {
            if (err) {
                assert.ifError(err);
            }

            var expected = [
                'github.com/a-team/bar',
                'github.com/b-team/baz',
                'github.com/b-team/qux',
                'github.com/company/common',
            ];

            assert.deepEqual(serviceDependencies, expected);

            assert.end();
        }
    })
);
