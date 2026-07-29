'use strict';

const { pushLog, setBotReady } = require('./state');

function scheduleBotRestart(reason = 'Bot restart') {
    pushLog('warn', reason);
    setBotReady(false);
    setTimeout(() => process.exit(1), 1200);
}

async function handleApplyAppState({ forceRestart = false, source = 'dashboard' } = {}) {
    const { applyAppStateFromRemote } = require('../utils/appstateSync');
    pushLog('info', `Áp dụng appstate (${source})`);
    const result = await applyAppStateFromRemote({ forceRestart });
    if (!result.ok) {
        pushLog('error', `Áp dụng appstate thất bại: ${result.error}`);
    }
    return result;
}

async function handlePasteAppState(raw) {
    const { applyAppStateFromPaste } = require('../utils/appstateSync');
    pushLog('info', 'Paste appstate (dashboard)');
    const result = await applyAppStateFromPaste(raw);
    if (!result.ok) {
        pushLog('error', `Paste appstate thất bại: ${result.error}`);
    } else if (result.binPushed) {
        pushLog('info', 'Paste OK · đã đẩy JSONBin');
    }
    return result;
}

function wantsForceRestart(req) {
    return (
        req.body?.force === true ||
        req.body?.forceRestart === true ||
        req.query.force === '1'
    );
}

module.exports = {
    scheduleBotRestart,
    handleApplyAppState,
    handlePasteAppState,
    wantsForceRestart
};
