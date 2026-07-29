'use strict';

const express = require('express');
const chalk = require('chalk');
const gradient = require('gradient-string');
const { pushLog } = require('./state');
const { getDashboardToken } = require('./auth');
const {
    setBotReady,
    setSessionStatus,
    setMqttStatus,
    getOverallHealth
} = require('./state');
const { buildStatusPayload } = require('./status');
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pages');

const boldText = (text) => chalk.bold(text);

function createApp() {
    const app = express();
    app.use(express.json({ limit: '512kb' }));
    app.use(express.urlencoded({ extended: false, limit: '512kb' }));

    app.use(pageRoutes);
    app.use('/api', apiRoutes);

    return app;
}

function startWebServer() {
    const app = createApp();
    const port = Number(process.env.PORT) || 3000;

    pushLog('info', 'HTTP server starting');

    return new Promise((resolve, reject) => {
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(boldText(gradient.cristal(`HTTP keep-alive on 0.0.0.0:${port}`)));
            console.log(boldText(gradient.cristal(`Dashboard: http://0.0.0.0:${port}/`)));
            console.log(boldText(gradient.cristal(`Login: http://0.0.0.0:${port}/login`)));
            if (getDashboardToken()) {
                console.log(boldText(gradient.cristal('Dashboard auth: login page + cookie')));
            } else {
                console.log(boldText(gradient.passion('Dashboard is public — set DASHBOARD_TOKEN')));
            }
            pushLog('info', `Listening on port ${port}`);
            resolve(server);
        });
        server.on('error', reject);
    });
}

module.exports = {
    createApp,
    startWebServer,
    setBotReady,
    setSessionStatus,
    setMqttStatus,
    pushLog,
    buildStatusPayload,
    getOverallHealth
};
