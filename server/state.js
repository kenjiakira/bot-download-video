'use strict';

const MAX_LOGS = 200;

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

function getBotReady() {
    return botReady;
}

function setSessionStatus(partial = {}) {
    sessionStatus = { ...sessionStatus, ...partial };
}

function getSessionStatus() {
    return sessionStatus;
}

function setMqttStatus(partial = {}) {
    mqttStatus = { ...mqttStatus, ...partial };
}

function getMqttStatus() {
    return mqttStatus;
}

function getStartedAt() {
    return startedAt;
}

function getRecentLogs(limit = MAX_LOGS) {
    return recentLogs.slice(0, Math.min(limit, recentLogs.length));
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

module.exports = {
    MAX_LOGS,
    setBotReady,
    getBotReady,
    setSessionStatus,
    getSessionStatus,
    setMqttStatus,
    getMqttStatus,
    getStartedAt,
    getRecentLogs,
    getOverallHealth,
    pushLog
};
