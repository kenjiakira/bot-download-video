'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'db_session';

function getDashboardToken() {
    return (process.env.DASHBOARD_TOKEN || '').trim();
}

function getWebhookSecret() {
    return (process.env.WEBHOOK_SECRET || process.env.APPSTATE_WEBHOOK_SECRET || '').trim();
}

function secretMatches(expected, provided) {
    if (!expected || !provided) return false;
    try {
        const a = Buffer.from(String(provided));
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch (_) {
        return provided === expected;
    }
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
    return secretMatches(expected, value);
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
    const maxAge = 60 * 60 * 24 * 7;
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
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

function requireAuth(req, res, next) {
    if (isAuthed(req)) return next();
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ ok: false, error: 'Unauthorized', login: '/login' });
    }
    const nextUrl = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/login?next=${nextUrl}`);
}

function verifyWebhook(req) {
    const secret = getWebhookSecret();
    if (!secret) return false;
    const provided =
        (req.headers['x-webhook-secret'] || '').toString() ||
        (req.query.secret || '').toString() ||
        (req.body?.secret || '').toString();
    return secretMatches(secret, provided);
}

module.exports = {
    COOKIE_NAME,
    getDashboardToken,
    getWebhookSecret,
    tokenMatches,
    isAuthed,
    setSessionCookie,
    clearSessionCookie,
    requireAuth,
    verifyWebhook
};
