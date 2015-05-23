'use strict';

var test = require('tape');

var thriftGod = require('../index.js');

test('thriftGod is a function', function t(assert) {
    assert.equal(typeof thriftGod, 'function');
    assert.end();
});
