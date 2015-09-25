var spawn = require('child_process').spawn;

process.stdin.resume();
process.chdir(__dirname);
var git = spawn('git', [], { stdio: 'inherit' });

git.once('close', function(code){
    process.stdin.pause();
})

