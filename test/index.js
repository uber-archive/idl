'use strict';

var TestCluster = require('./lib/test-cluster.js');

TestCluster.test('first test', {
    config: {}
}, function t(cluster, assert) {
    console.log('??', !!cluster);

    setInterval(function loop() {

    }, 1000);
});
