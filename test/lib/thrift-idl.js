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

var template = require('string-template');

module.exports = {
    thriftIdl: thriftIdl,
    thriftIdlWithIncludes: thriftIdlWithIncludes
};

function thriftIdl(serviceName) {
    var idlTemplate = [
        'service {serviceName} {',
        '    i32 echo(1:i32 value)',
        '}'
    ].join('\n') + '\n';

    return template(idlTemplate, {
        serviceName: serviceName
    });
}

function thriftIdlWithIncludes(serviceName, includes) {
    var idlTemplate = [
        '{includes}',
        'service {serviceName} {',
        '    i32 echo(1:i32 value)',
        '}'
    ].join('\n') + '\n';

    return template(idlTemplate, {
        serviceName: serviceName,
        includes: includes.length > 0 ? getIncludesTemplate(includes) : ''
    });
}

function getIncludesTemplate(includes) {
    var includeTemplate = [];
    for (var i = 0; i < includes.length; i++) {
        includeTemplate.push('include {' + i + '}');
    }
    return template(includeTemplate.join('\n') + '\n', includes);
}
