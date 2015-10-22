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

var exec = require('child_process').exec;

module.exports = ServiceName;

function ServiceName(logger) {
    return function getServiceName(servicePath, cb) {
        var command = 'git remote --verbose';
        exec(command, {
            cwd: servicePath,
            logger: logger,
            ignoreStderr: true
        }, onVerboseRemote);

        function onVerboseRemote(err, stdout, stderr) {
            if (err) {
                return cb(err);
            }

            // this works for both HTTPS and SSH git remotes
            var gitUrl = stdout.split('\n').filter(origin)[0]
                .split(/\s/)[1]     // get the first git url
                .split('@');

            // drop everything before the username
            gitUrl = gitUrl[1] ? gitUrl[1] : gitUrl[0];

            if (gitUrl.indexOf('https://') === 0) {
                gitUrl = gitUrl.replace('https://', '');
            }

            gitUrl = gitUrl.split('.git')[0]   // drop .git suffix if one
                .replace(':', '/'); // convert to valid path

            cb(null, gitUrl);
        }
    };
}

function origin(line) {
    return line.indexOf('origin') === 0;
}
