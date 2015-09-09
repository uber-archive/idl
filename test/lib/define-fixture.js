'use strict';

var thriftIdl = require('./thrift-idl');

module.exports = defineFixture;

function defineFixture(opts) {
    var fixture = {
        gitUrl: 'git@github.com:org/' + opts.name.toLowerCase(),
        branch: opts.branch || 'master',
        files: {
            'thrift': {
                'github.com': {
                    'org': {}
                }
            }
        }
    };

    fixture.files.thrift['github.com'].org[opts.name.toLowerCase()] = {
        'service.thrift': thriftIdl(opts.name)
    };

    return fixture;
}
