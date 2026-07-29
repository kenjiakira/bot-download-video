'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { isAuthed, requireAuth } = require('../auth');
const {
    getBotReady,
    getSessionStatus,
    getMqttStatus,
    getOverallHealth
} = require('../state');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const router = express.Router();

function sendFile(res, name) {
    const file = path.join(PUBLIC_DIR, name);
    if (!fs.existsSync(file)) return res.status(404).send(`${name} missing`);
    return res.sendFile(file);
}

router.get('/ping', (_req, res) => res.status(200).send('pong'));

router.get('/health', (_req, res) => {
    res.status(200).json({
        ok: true,
        botReady: getBotReady(),
        sessionAlive: getSessionStatus().alive,
        mqttConnected: getMqttStatus().connected,
        health: getOverallHealth(),
        lastCheckAt: getSessionStatus().lastCheckAt
    });
});

router.get('/login', (req, res) => {
    if (isAuthed(req)) return res.redirect('/');
    return sendFile(res, 'login.html');
});

router.get('/session', requireAuth, (_req, res) => {
    res.status(200).json({ botReady: getBotReady(), ...getSessionStatus() });
});

router.get('/', requireAuth, (_req, res) => sendFile(res, 'dashboard.html'));
router.get('/dashboard', requireAuth, (_req, res) => sendFile(res, 'dashboard.html'));

module.exports = router;
