'use strict';

var crypto = require('crypto');
var readDirFiles = require('read-dir-files').read;

module.exports.sha1 = sha1;
module.exports.shasumFiles = shasumFiles;

function sha1(content) {
    var hash = crypto.createHash('sha1');
    hash.update(content);
    return hash.digest('hex');
}

function shasumFiles(dir, callback) {
    readDirFiles(dir, 'utf8', onFiles);

    function onFiles(err, files) {
        if (err) {
            return callback(err);
        }

        var shasums = Object.keys(files).reduce(hashFile, {});

        callback(null, shasums);

        function hashFile(memo, filename) {
            memo[filename] = sha1(files[filename]);
            return memo;
        }
    }
}
