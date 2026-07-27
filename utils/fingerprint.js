const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const gradient = require('gradient-string');

const boldText = (text) => chalk.bold(text);

const DEFAULT_UA =
    process.env.FB_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PROXY_STATE_FILE = path.join(__dirname, '..', 'database', 'json', 'proxyState.json');

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadProxyList() {
    const proxPath = path.join(__dirname, 'prox.txt');
    if (!fs.existsSync(proxPath)) return [];
    return fs
        .readFileSync(proxPath, 'utf-8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
}

function normalizeProxy(raw) {
    if (!raw) return null;
    const p = String(raw).trim();
    if (!p) return null;
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('socks')) return p;
    return `http://${p}`;
}

function readSavedProxy() {
    try {
        if (fs.existsSync(PROXY_STATE_FILE)) {
            return JSON.parse(fs.readFileSync(PROXY_STATE_FILE, 'utf8'));
        }
    } catch (_) {}
    return null;
}

function saveProxy(proxy) {
    try {
        ensureDir(PROXY_STATE_FILE);
        fs.writeFileSync(
            PROXY_STATE_FILE,
            JSON.stringify({ proxy, updatedAt: Date.now() }, null, 2),
            'utf8'
        );
    } catch (_) {}
}

function clearSavedProxy() {
    try {
        if (fs.existsSync(PROXY_STATE_FILE)) fs.unlinkSync(PROXY_STATE_FILE);
    } catch (_) {}
}

function isProxyEnabled() {
    if (process.env.PROXY_URL || process.env.PROXY) return true;
    const v = (process.env.PROXY_ENABLED || 'false').toString().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function resolveStableProxy({ rotate = false } = {}) {
    if (!isProxyEnabled()) {
        console.log(
            boldText(
                gradient.cristal('[fingerprint] Proxy disabled (set PROXY_ENABLED=true or PROXY_URL to enable)')
            )
        );
        return null;
    }

    const fromEnv = normalizeProxy(process.env.PROXY_URL || process.env.PROXY);
    if (fromEnv) {
        console.log(boldText(gradient.cristal(`[fingerprint] Proxy from env: ${fromEnv}`)));
        return fromEnv;
    }

    const list = loadProxyList().map(normalizeProxy).filter(Boolean);
    if (!list.length) {
        console.log(boldText(gradient.cristal('[fingerprint] No proxy configured')));
        return null;
    }

    const saved = readSavedProxy();
    let chosen = null;

    if (!rotate && saved?.proxy) {
        const savedNorm = normalizeProxy(saved.proxy);
        if (list.includes(savedNorm)) chosen = savedNorm;
    }

    if (!chosen) {
        let idx = 0;
        if (rotate && saved?.proxy) {
            const prev = list.indexOf(normalizeProxy(saved.proxy));
            idx = prev >= 0 ? (prev + 1) % list.length : 0;
        }
        chosen = list[idx];
        saveProxy(chosen);
    }

    console.log(boldText(gradient.cristal(`[fingerprint] Stable proxy: ${chosen}`)));
    return chosen;
}

function applyProxy(fcaName, proxy) {
    global.cc.proxy = proxy || null;
    try {
        const fcaUtils = require(path.join(__dirname, '..', 'logins', fcaName, 'utils.js'));
        if (fcaUtils && typeof fcaUtils.setProxy === 'function') {
            fcaUtils.setProxy(proxy || null);
        }
    } catch (_) {}
}

function isProxyTunnelError(err) {
    const msg = [err?.message, err?.stack, err?.code, typeof err === 'string' ? err : '']
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return (
        msg.includes('tunneling socket') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('proxy') ||
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'ECONNRESET'
    );
}

function getUserAgent() {
    return DEFAULT_UA;
}

function getLoginOptions(appState) {
    return {
        appState,
        logLevel: 'silent',
        forceLogin: process.env.FORCE_LOGIN !== 'false',
        userAgent: getUserAgent(),
        autoMarkDelivery: false,
        autoMarkRead: false,
        selfListen: false,
        listenEvents: true,
        updatePresence: false,
        online: false
    };
}

module.exports = {
    resolveStableProxy,
    applyProxy,
    clearSavedProxy,
    isProxyEnabled,
    isProxyTunnelError,
    getUserAgent,
    getLoginOptions,
    DEFAULT_UA
};
