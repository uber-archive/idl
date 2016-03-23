'use strict';

var fs = require('fs');

module.exports = readJSON;

function readJSON(filename, options, callback) {
    if (callback === undefined) {
        callback = options;
        options = {};
    }

    fs.readFile(filename, options, function onReadFile(error, bf) {
        if (error) {
            return callback(error);
        }

        try {
            bf = JSON.parse(bf.toString().replace(/^\ufeff/g, ''));
        } catch (err) {
            return callback(err);
        }

        callback(undefined, bf);
    });
}
