'use strict';

var gitexec = require('./git-process.js').exec;

module.exports = ServiceName;

function ServiceName(logger) {
    return function getServiceName(servicePath, cb) {
        var command = 'git remote --verbose';
        gitexec(command, {
            cwd: servicePath,
            logger: logger,
            ignoreStderr: true
        }, onVerboseRemote);

        function onVerboseRemote(err, stdout, stderr) {
            if (err) {
                return cb(err);
            }

            // this works for both HTTPS and SSH git remotes
            var gitUrl = stdout
                .split(/\s/)[1]     // get the first git url
                .split('@')[1]      // drop everything before the username
                .split('.git')[0]   // drop .git suffix if one
                .replace(':', '/'); // convert to valid path

            cb(null, gitUrl);
        }
    }
}

