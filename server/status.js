'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    getBotReady,
    getSessionStatus,
    getMqttStatus,
    getStartedAt,
    getRecentLogs,
    getOverallHealth
} = require('./state');
const { getDashboardToken, getWebhookSecret } = require('./auth');

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
        sessionGuard = require('../utils/sessionGuard').getSessionGuardInfo();
    } catch (_) {}

    let syncInfo = { enabled: false, interval: 15, binConfigured: false, webhookConfigured: false };
    try {
        const { getSyncConfig, isSyncEnabled } = require('../utils/appstateSync');
        const cfg = getSyncConfig();
        syncInfo = {
            enabled: isSyncEnabled() && Boolean(cfg.url),
            interval: Number(process.env.APPSTATE_SYNC_INTERVAL || 15),
            binConfigured: Boolean(cfg.binId || cfg.url),
            webhookConfigured: Boolean(getWebhookSecret())
        };
    } catch (_) {}

    const sessionStatus = getSessionStatus();
    const mqttStatus = getMqttStatus();
    const botReady = getBotReady();

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
            uptimeSec: Math.floor((Date.now() - getStartedAt()) / 1000),
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
        sync: syncInfo,
        logs: getRecentLogs(120),
        authRequired: Boolean(getDashboardToken())
    };
}

module.exports = { buildStatusPayload, formatBytes };
