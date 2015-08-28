'use strict';

var template = require('string-template');

module.exports = thriftIdl;

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
