'use strict';

const express = require('express');
const { getRecentLogs, pushLog } = require('../state');
const {
    getDashboardToken,
    getWebhookSecret,
    tokenMatches,
    setSessionCookie,
    clearSessionCookie,
    isAuthed,
    requireAuth,
    verifyWebhook
} = require('../auth');
const { buildStatusPayload } = require('../status');
const { scheduleBotRestart, handleApplyAppState, handlePasteAppState, wantsForceRestart } = require('../actions');

const router = express.Router();

router.post('/login', (req, res) => {
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

router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    return res.json({ ok: true });
});

router.get('/auth/check', (req, res) => {
    res.json({
        ok: true,
        authed: isAuthed(req),
        authRequired: Boolean(getDashboardToken())
    });
});

router.get('/status', requireAuth, (_req, res) => {
    res.status(200).json(buildStatusPayload());
});

router.get('/logs', requireAuth, (req, res) => {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10)));
    res.json({ ok: true, logs: getRecentLogs(limit) });
});

router.post('/actions/check-session', requireAuth, async (_req, res) => {
    try {
        const { runCheck, getSessionGuardInfo } = require('../../utils/sessionGuard');
        const guard = getSessionGuardInfo();
        if (!guard.running) {
            return res.status(400).json({ ok: false, error: 'Bot chưa sẵn sàng' });
        }
        pushLog('info', 'Kiểm tra session (dashboard)');
        await runCheck();
        const payload = buildStatusPayload();
        return res.json({
            ok: true,
            session: payload.session,
            health: payload.health,
            message: payload.session?.alive ? 'Session OK' : 'Session lỗi'
        });
    } catch (error) {
        pushLog('error', `Kiểm tra session thất bại: ${error.message}`);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

router.post('/actions/paste-appstate', requireAuth, async (req, res) => {
    try {
        const raw = req.body?.appstate ?? req.body?.content ?? req.body?.json ?? '';
        const result = await handlePasteAppState(raw);
        if (!result.ok) return res.status(400).json(result);
        res.json(result);
        if (result.restarting) scheduleBotRestart('Paste appstate — restart');
    } catch (error) {
        pushLog('error', `Paste appstate thất bại: ${error.message}`);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

router.post('/actions/apply-appstate', requireAuth, async (req, res) => {
    try {
        const result = await handleApplyAppState({
            forceRestart: true,
            source: 'dashboard'
        });
        if (!result.ok) return res.status(400).json(result);
        if (result.restarting) {
            res.json(result);
            return scheduleBotRestart('Áp dụng appstate — restart');
        }
        return res.json(result);
    } catch (error) {
        pushLog('error', `Áp dụng appstate thất bại: ${error.message}`);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

router.post('/actions/restart', requireAuth, (_req, res) => {
    res.json({ ok: true, message: 'Bot đang khởi động lại…', restarting: true });
    scheduleBotRestart('Restart bot (dashboard)');
});

router.post('/webhook/appstate', async (req, res) => {
    if (!getWebhookSecret()) {
        return res.status(503).json({ ok: false, error: 'WEBHOOK_SECRET chưa cấu hình' });
    }
    if (!verifyWebhook(req)) {
        pushLog('warn', 'Webhook appstate: unauthorized');
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    try {
        const result = await handleApplyAppState({
            forceRestart: wantsForceRestart(req),
            source: 'webhook'
        });
        if (!result.ok) return res.status(400).json(result);
        if (result.restarting) {
            res.json(result);
            return scheduleBotRestart('Webhook appstate — restart');
        }
        return res.json(result);
    } catch (error) {
        pushLog('error', `Webhook appstate lỗi: ${error.message}`);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

module.exports = router;
