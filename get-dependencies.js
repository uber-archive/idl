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

var readDirFiles = require('read-dir-files').read;
var traverse = require('traverse');
var path = require('path');
var dirname = path.dirname;

module.exports = getIncludes;

function parseIncludes(thriftFile) {
    var includes = (thriftFile.split('\n').reduce(function acc(memo, line) {
        var parts = line.split(/\s/);
        if (parts[0] === 'include') {
            memo.push(parts[1].substr(1, parts[1].length - 2));
        }
        return memo;
    }, []));
    return includes;
}

function getIncludes(directory, callback) {
    var thriftDir = dirname(dirname(dirname(directory)));
    var currentModule = path.relative(thriftDir, directory);

    resolveAllInstalledDependencies(thriftDir, onDependencyMap);

    function onDependencyMap(err, dependencyMap) {
        if (err) {
            return callback(err);
        }

        callback(null, dependencyMap[currentModule] || []);
    }
}

function resolveAllInstalledDependencies(thriftDir, callback) {
    readDirFiles(thriftDir, 'utf8', onReadFiles);

    function onReadFiles(err, files) {
        if (err) {
            return callback(err);
        }

        var modules = traverse(files).reduce(acc, {});

        callback(null, modules);
    }

    function acc(memo, value) {
        if (this.isLeaf &&
            (this.path[this.path.length - 1].indexOf('.thrift') !== -1)) {

            var dir = this.path.slice(0, this.path.length - 1).join('/');
            var includes = parseIncludes(value);
            if (includes.length > 0) {
                memo[dir] = [].concat(includes.map(pathToServiceName));
            }
        }
        return memo;

        function pathToServiceName(relativeInclude) {
            var absoluteInclude = path.resolve(
                thriftDir,
                dir,
                relativeInclude
            );
            return path.dirname(
                absoluteInclude.substr(
                    thriftDir.length + 1,
                    absoluteInclude.length - 1
                )
            );
        }
    }
}
