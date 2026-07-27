const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const chalk = require('chalk');
const gradient = require('gradient-string');

const boldText = (text) => chalk.bold(text);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_LOGS = 200;
const COOKIE_NAME = 'db_session';

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
let mqttStatus = {
    connected: null,
    lastEventAt: null,
    lastErrorAt: null,
    lastError: null,
    reconnects: 0
};
const recentLogs = [];

function setBotReady(ready = true) {
    botReady = ready;
}

function setSessionStatus(partial = {}) {
    sessionStatus = { ...sessionStatus, ...partial };
}

function setMqttStatus(partial = {}) {
    mqttStatus = { ...mqttStatus, ...partial };
}

function getOverallHealth() {
    const sessionOk = sessionStatus.alive === true;
    const sessionDead = sessionStatus.alive === false;
    const mqttOk = mqttStatus.connected === true;
    const mqttDown = mqttStatus.connected === false;

    if (sessionDead) {
        return { level: 'bad', label: 'Session DIE', detail: sessionStatus.lastError || 'appstate invalid' };
    }
    if (sessionOk && mqttDown) {
        return {
            level: 'warn',
            label: 'Cookie OK · MQTT đứt',
            detail: mqttStatus.lastError || 'listenMqtt unavailable — bot không nhận tin'
        };
    }
    if (sessionOk && mqttOk) {
        return { level: 'ok', label: 'Healthy', detail: 'Session + MQTT OK' };
    }
    if (sessionOk) {
        return { level: 'warn', label: 'Cookie OK · MQTT chưa rõ', detail: 'Chưa nhận event MQTT' };
    }
    return { level: 'warn', label: 'Đang kiểm tra…', detail: 'Chờ session/MQTT' };
}

function pushLog(level, message, meta = null) {
    const entry = {
        at: Date.now(),
        level: level || 'info',
        message: String(message || '').slice(0, 800),
        meta: meta || undefined
    };
    recentLogs.unshift(entry);
    if (recentLogs.length > MAX_LOGS) recentLogs.length = MAX_LOGS;

    const stamp = new Date(entry.at).toLocaleTimeString('vi-VN');
    const line = `[console ${stamp}] [${entry.level}] ${entry.message}`;
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warn') console.warn(line);
    else console.log(line);
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

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const out = {};
    header.split(';').forEach((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    });
    return out;
}

function tokenMatches(value) {
    const expected = getDashboardToken();
    if (!expected) return true;
    if (!value) return false;
    try {
        const a = Buffer.from(String(value));
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch (_) {
        return value === expected;
    }
}

function readAuthToken(req) {
    const cookies = parseCookies(req);
    if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
    const fromQuery = (req.query.token || '').toString();
    if (fromQuery) return fromQuery;
    const header = (req.headers.authorization || '').toString();
    if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
    return (req.headers['x-dashboard-token'] || '').toString();
}

function isAuthed(req) {
    if (!getDashboardToken()) return true;
    return tokenMatches(readAuthToken(req));
}

function setSessionCookie(res, token) {
    const maxAge = 60 * 60 * 24 * 7; // 7 days
    const secure = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        `Max-Age=${maxAge}`,
        'HttpOnly',
        'SameSite=Lax'
    ];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
    res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    );
}

function requireAuth(req, res, next) {
    if (isAuthed(req)) return next();

    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'Unauthorized', login: '/login' });
    }
    const nextUrl = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/login?next=${nextUrl}`);
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
        mqtt: { ...mqttStatus },
        health: getOverallHealth(),
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
        logs: recentLogs.slice(0, 120),
        authRequired: Boolean(getDashboardToken())
    };
}

function sendFile(res, name) {
    const file = path.join(PUBLIC_DIR, name);
    if (!fs.existsSync(file)) return res.status(404).send(`${name} missing`);
    return res.sendFile(file);
}

function startWebServer() {
    const app = express();
    const port = Number(process.env.PORT) || 3000;

    app.use(express.json({ limit: '32kb' }));
    app.use(express.urlencoded({ extended: false }));

    // Keep-alive — no auth
    app.get('/ping', (_req, res) => res.status(200).send('pong'));
    app.get('/health', (_req, res) => {
        const health = getOverallHealth();
        res.status(200).json({
            ok: true,
            botReady,
            sessionAlive: sessionStatus.alive,
            mqttConnected: mqttStatus.connected,
            health,
            lastCheckAt: sessionStatus.lastCheckAt
        });
    });

    // Public login page + API
    app.get('/login', (req, res) => {
        if (isAuthed(req)) return res.redirect('/');
        return sendFile(res, 'login.html');
    });

    app.post('/api/login', (req, res) => {
        const expected = getDashboardToken();
        if (!expected) {
            return res.json({ ok: true, message: 'Auth disabled' });
        }
        const token = (req.body?.token || req.body?.password || '').toString().trim();
        if (!tokenMatches(token)) {
            pushLog('warn', 'Dashboard login failed');
            return res.status(401).json({ ok: false, error: 'Sai mật khẩu / token' });
        }
        setSessionCookie(res, expected);
        pushLog('info', 'Dashboard login OK');
        return res.json({ ok: true });
    });

    app.post('/api/logout', (_req, res) => {
        clearSessionCookie(res);
        return res.json({ ok: true });
    });

    app.get('/api/auth/check', (req, res) => {
        res.json({
            ok: true,
            authed: isAuthed(req),
            authRequired: Boolean(getDashboardToken())
        });
    });

    // Protected
    app.get('/api/status', requireAuth, (_req, res) => {
        res.status(200).json(buildStatusPayload());
    });

    app.get('/api/logs', requireAuth, (req, res) => {
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10)));
        res.json({ ok: true, logs: recentLogs.slice(0, limit) });
    });

    app.get('/session', requireAuth, (_req, res) => {
        res.status(200).json({ botReady, ...sessionStatus });
    });

    app.get('/', requireAuth, (_req, res) => sendFile(res, 'dashboard.html'));
    app.get('/dashboard', requireAuth, (_req, res) => sendFile(res, 'dashboard.html'));

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
    startWebServer,
    setBotReady,
    setSessionStatus,
    setMqttStatus,
    pushLog,
    buildStatusPayload,
    getOverallHealth
};
