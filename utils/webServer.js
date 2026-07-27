const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const chalk = require('chalk');
const gradient = require('gradient-string');

const boldText = (text) => chalk.bold(text);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_LOGS = 80;

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
const recentLogs = [];

function setBotReady(ready = true) {
    botReady = ready;
}

function setSessionStatus(partial = {}) {
    sessionStatus = { ...sessionStatus, ...partial };
}

function pushLog(level, message) {
    recentLogs.unshift({
        at: Date.now(),
        level: level || 'info',
        message: String(message || '').slice(0, 500)
    });
    if (recentLogs.length > MAX_LOGS) recentLogs.length = MAX_LOGS;
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getDashboardToken() {
    return (process.env.DASHBOARD_TOKEN || '').trim();
}

function authDashboard(req, res, next) {
    const expected = getDashboardToken();
    if (!expected) return next();

    const fromQuery = (req.query.token || '').toString();
    const header = (req.headers.authorization || '').toString();
    const fromHeader = header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : (req.headers['x-dashboard-token'] || '').toString();

    if (fromQuery === expected || fromHeader === expected) return next();

    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'Unauthorized — missing or invalid token' });
    }

    return res
        .status(401)
        .type('html')
        .send(
            `<!doctype html><html><head><meta charset="utf-8"><title>Unauthorized</title>
<style>body{font-family:system-ui;background:#0b1220;color:#e8eefc;display:grid;place-items:center;min-height:100vh;margin:0}
card{background:#121a2b;padding:2rem 2.5rem;border-radius:16px;border:1px solid #243047;max-width:420px}
code{background:#1a2438;padding:.2rem .45rem;border-radius:6px}</style></head>
<body><card><h1>401</h1><p>Thêm <code>?token=YOUR_TOKEN</code> vào URL dashboard.</p></card></body></html>`
        );
}

function buildStatusPayload() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    let admin = {};
    try {
        admin = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'admin.json'), 'utf8'));
    } catch (_) {}

    let sessionGuard = {};
    try {
        sessionGuard = require('./sessionGuard').getSessionGuardInfo();
    } catch (_) {}

    return {
        ok: true,
        service: 'bot-download-video',
        refreshedAt: Date.now(),
        bot: {
            name: admin.botName || global.cc?.botName || 'Download Bot',
            owner: admin.ownerName || global.cc?.developer || null,
            prefix: admin.prefix || global.cc?.prefix || '/',
            fca: admin.FCA || 'hut-chat-api',
            ready: botReady
        },
        session: {
            ...sessionStatus,
            guard: sessionGuard
        },
        runtime: {
            uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
            processUptimeSec: Math.floor(process.uptime()),
            node: process.version,
            platform: `${os.platform()} ${os.arch()}`,
            hostname: os.hostname(),
            pid: process.pid,
            memory: {
                used: usedMem,
                free: freeMem,
                total: totalMem,
                usedLabel: formatBytes(usedMem),
                freeLabel: formatBytes(freeMem),
                totalLabel: formatBytes(totalMem),
                usedPercent: Number(((usedMem / totalMem) * 100).toFixed(1))
            },
            cpus: (os.cpus() || []).length,
            loadAvg: os.loadavg().map((n) => Number(n.toFixed(2)))
        },
        antiDie: {
            proxyEnabled: process.env.PROXY_ENABLED === 'true' || Boolean(process.env.PROXY_URL),
            proxy: global.cc?.proxy || null,
            loginDelayMs: Number(process.env.LOGIN_DELAY_MS || 3000),
            sendDelayMs: Number(process.env.SEND_DELAY_MS || 2500),
            downloadConcurrency: Number(process.env.DOWNLOAD_CONCURRENCY || 1),
            downloadCooldownMs: Number(process.env.DOWNLOAD_COOLDOWN_MS || 120000),
            sessionCheckInterval: Number(process.env.SESSION_CHECK_INTERVAL || 5),
            autoRestart: process.env.AUTO_RESTART_ENABLED === 'true'
        },
        logs: recentLogs.slice(0, 40),
        authRequired: Boolean(getDashboardToken())
    };
}

function startWebServer() {
    const app = express();
    const port = Number(process.env.PORT) || 3000;

    app.use(express.json({ limit: '32kb' }));

    // Keep-alive endpoints — no auth (UptimeRobot)
    app.get('/ping', (_req, res) => res.status(200).send('pong'));
    app.get('/health', (_req, res) => {
        res.status(200).json({
            ok: true,
            botReady,
            sessionAlive: sessionStatus.alive,
            lastCheckAt: sessionStatus.lastCheckAt
        });
    });

    // Dashboard + API — optional token
    app.use(['/', '/dashboard', '/api'], authDashboard);

    app.get('/api/status', (_req, res) => {
        res.status(200).json(buildStatusPayload());
    });

    app.get('/session', (_req, res) => {
        res.status(200).json({ botReady, ...sessionStatus });
    });

    const dashboardFile = path.join(PUBLIC_DIR, 'dashboard.html');
    const serveDashboard = (_req, res) => {
        if (!fs.existsSync(dashboardFile)) {
            return res.status(404).send('dashboard.html missing');
        }
        res.sendFile(dashboardFile);
    };

    app.get('/', serveDashboard);
    app.get('/dashboard', serveDashboard);

    if (fs.existsSync(PUBLIC_DIR)) {
        app.use('/assets', express.static(PUBLIC_DIR));
    }

    pushLog('info', 'HTTP server starting');

    return new Promise((resolve, reject) => {
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(boldText(gradient.cristal(`HTTP keep-alive on 0.0.0.0:${port}`)));
            console.log(boldText(gradient.cristal(`Dashboard: http://0.0.0.0:${port}/`)));
            console.log(boldText(gradient.cristal(`API: GET /api/status · UptimeRobot: /ping`)));
            if (getDashboardToken()) {
                console.log(boldText(gradient.cristal('Dashboard auth: DASHBOARD_TOKEN is set')));
            } else {
                console.log(boldText(gradient.passion('Dashboard is public — set DASHBOARD_TOKEN to lock it')));
            }
            pushLog('info', `Listening on port ${port}`);
            resolve(server);
        });
        server.on('error', reject);
    });
}

module.exports = {
    startWebServer,
    setBotReady,
    setSessionStatus,
    pushLog,
    buildStatusPayload
};
