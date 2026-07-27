const { spawn } = require('child_process');
const gradient = require('gradient-string');
const chalk = require('chalk');

const boldText = (text) => chalk.bold(text);
console.error(boldText(gradient.cristal('Starting download bot...')));

function startBotProcess() {
    const child = spawn('node', ['--trace-warnings', '--async-stack-traces', 'main.js'], {
        cwd: __dirname,
        stdio: 'inherit',
        shell: true
    });

    child.on('close', (codeExit) => {
        console.log(`Messenger Bot exited with code: ${codeExit}`);
        if (codeExit !== 0) {
            setTimeout(startBotProcess, 3000);
        }
    });

    child.on('error', (error) => {
        console.error(`Error starting bot: ${error}`);
    });
}

startBotProcess();

process.on('SIGINT', () => {
    process.exit();
});
