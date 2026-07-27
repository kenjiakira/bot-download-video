const express = require('express');
const chalk = require('chalk');
const gradient = require('gradient-string');

const boldText = (text) => chalk.bold(text);

let startedAt = Date.now();
let botReady = false;
let sessionStatus = {
    alive: null,
    lastCheckAt: null,
    lastOkAt: null,
    lastError: null,
    consecutiveFails: 0,
    userName: null
};

function setBotReady(ready = true) {
    botReady = ready;
}

function setSessionStatus( partial = {}) {
    sessionStatus = { ...sessionStatus, ...partial };
}

function startWebServer() {
    const app = express();
    const port = Number(process.env.PORT) || 3000;

    app.get('/', (_req, res) => {
        res.status(200).json({
            ok: true,
            service: 'bot-download-video',
            botReady,
            session: sessionStatus,
            uptimeSec: Math.floor((Date.now() - startedAt) / 1000)
        });
    });

    app.get('/health', (_req, res) => {
        const alive = sessionStatus.alive;
        res.status(200).json({
            ok: true,
            botReady,
            sessionAlive: alive,
            lastCheckAt: sessionStatus.lastCheckAt,
            lastError: sessionStatus.lastError
        });
    });

    app.get('/ping', (_req, res) => {
        res.status(200).send('pong');
    });

    app.get('/session', (_req, res) => {
        res.status(200).json({
            botReady,
            ...sessionStatus
        });
    });

    return new Promise((resolve, reject) => {
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(boldText(gradient.cristal(`HTTP keep-alive on 0.0.0.0:${port}`)));
            console.log(boldText(gradient.cristal(`UptimeRobot URL: https://<your-app>.onrender.com/ping`)));
            console.log(boldText(gradient.cristal(`Session status: GET /session`)));
            resolve(server);
        });
        server.on('error', reject);
    });
}

module.exports = { startWebServer, setBotReady, setSessionStatus };
