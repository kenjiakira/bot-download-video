const chalk = require('chalk');
const gradient = require('gradient-string');
const { setBotReady, setSessionStatus } = require('./webServer');

const boldText = (text) => chalk.bold(text);

let checkTimer = null;
let apiRef = null;
let dead = false;
let checking = false;
let consecutiveFails = 0;
let lastOkAt = null;
let lastCheckAt = null;
let lastError = null;
let recovering = false;

const FAIL_THRESHOLD = Math.max(1, parseInt(process.env.SESSION_FAIL_THRESHOLD || '2', 10));

function isDeadError(err) {
    if (!err) return false;
    const msg = [
        err.error,
        err.errorSummary,
        err.message,
        typeof err === 'string' ? err : ''
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    const needles = [
        'not logged in',
        'login approval',
        'checkpoint',
        'session expired',
        'logged out',
        'invalid session',
        'blocked the login',
        'facebook blocked'
    ];

    if (needles.some((n) => msg.includes(n))) return true;
    if (err.error === 3252001 || err.blockedAction) return true;
    return false;
}

function promisifyGetUserInfo(api, uid) {
    return new Promise((resolve, reject) => {
        try {
            api.getUserInfo(uid, (err, data) => {
                if (err) return reject(err);
                resolve(data);
            });
        } catch (e) {
            reject(e);
        }
    });
}

async function probeSession(api) {
    const uid = api.getCurrentUserID && api.getCurrentUserID();
    if (!uid) {
        throw { error: 'Not logged in.', message: 'Missing current user ID' };
    }
    const info = await promisifyGetUserInfo(api, uid);
    if (!info || !info[uid]) {
        throw { error: 'Not logged in.', message: 'getUserInfo returned empty profile' };
    }
    return info[uid];
}

async function notifyAdmins(api, text) {
    const admins = (global.cc && global.cc.adminBot) || [];
    if (!admins.length) {
        console.error(boldText(gradient.passion('[session] No adminUIDs to notify')));
        return;
    }

    for (const uid of admins) {
        try {
            await new Promise((resolve) => {
                api.sendMessage(text, uid, (err) => {
                    if (err) {
                        console.error(
                            boldText(gradient.passion(`[session] Notify admin ${uid} failed:`)),
                            err?.error || err?.message || err
                        );
                    }
                    resolve();
                });
            });
        } catch (_) {}
    }
}

async function tryRecoverFromJsonBin() {
    if (recovering) return false;
    recovering = true;
    try {
        const { getSyncConfig, checkAndUpdateAppState } = require('./appstateSync');
        const cfg = getSyncConfig();
        if (!cfg.enabled) {
            console.log(boldText(gradient.passion('[session] JSONBin sync tắt — không thể tự recover')));
            return false;
        }
        console.log(boldText(gradient.cristal('[session] Đang poll JSONBin để lấy appstate mới...')));
        const updated = await checkAndUpdateAppState(cfg.url, cfg.apiKey, false, cfg.keyType || 'master');
        if (updated) {
            console.log(
                boldText(gradient.retro('[session] Có appstate mới — restart để login lại trong 3s...'))
            );
            setTimeout(() => process.exit(1), 3000);
            return true;
        }
        console.log(boldText(gradient.passion('[session] JSONBin chưa có appstate mới')));
        return false;
    } catch (e) {
        console.error(boldText(gradient.passion('[session] Recover JSONBin lỗi:')), e.message);
        return false;
    } finally {
        recovering = false;
    }
}

async function handleDead(api, err) {
    if (dead) {
        // already dead — keep trying JSONBin quietly
        await tryRecoverFromJsonBin();
        return;
    }

    dead = true;
    setBotReady(false);
    setSessionStatus({
        alive: false,
        lastCheckAt,
        lastOkAt,
        lastError: err?.error || err?.message || String(err),
        consecutiveFails
    });

    const detail = err?.error || err?.message || err?.errorSummary || 'unknown';
    console.error(boldText(gradient.passion(`[session] APPSTATE DIE — ${detail}`)));

    await notifyAdmins(
        api,
        `⚠️ Bot session DIE\n` +
            `━━━━━━━━━━━━━━\n` +
            `Lỗi: ${detail}\n` +
            `Lúc: ${new Date().toLocaleString('vi-VN')}\n` +
            `Hãy cập nhật cookie lên JSONBin — bot sẽ tự poll và login lại.`
    );

    await tryRecoverFromJsonBin();
}

async function runCheck() {
    if (!apiRef || checking) return;
    checking = true;
    lastCheckAt = Date.now();

    try {
        const profile = await probeSession(apiRef);
        consecutiveFails = 0;
        lastOkAt = Date.now();
        lastError = null;

        if (dead) {
            dead = false;
            setBotReady(true);
            console.log(boldText(gradient.cristal('[session] Session sống lại')));
            await notifyAdmins(apiRef, `✅ Bot session OK trở lại (${profile.name || 'user'})`);
        }

        setSessionStatus({
            alive: true,
            lastCheckAt,
            lastOkAt,
            lastError: null,
            consecutiveFails: 0,
            userName: profile.name || null
        });

        console.log(
            boldText(
                gradient.cristal(
                    `[session] OK — ${profile.name || 'user'} (check ${new Date(lastCheckAt).toLocaleTimeString('vi-VN')})`
                )
            )
        );
    } catch (err) {
        consecutiveFails += 1;
        lastError = err?.error || err?.message || String(err);
        setSessionStatus({
            alive: !isDeadError(err) && consecutiveFails < FAIL_THRESHOLD,
            lastCheckAt,
            lastOkAt,
            lastError,
            consecutiveFails
        });

        console.error(
            boldText(gradient.passion(`[session] Check fail (${consecutiveFails}/${FAIL_THRESHOLD}):`)),
            lastError
        );

        if (isDeadError(err) || consecutiveFails >= FAIL_THRESHOLD) {
            await handleDead(apiRef, err);
        }
    } finally {
        checking = false;
    }
}

/**
 * Start periodic session health check (default every 5 minutes).
 */
function startSessionGuard(api, options = {}) {
    stopSessionGuard();
    apiRef = api;
    dead = false;
    consecutiveFails = 0;
    recovering = false;

    const minutes = Math.max(
        1,
        parseInt(options.intervalMinutes || process.env.SESSION_CHECK_INTERVAL || '5', 10)
    );
    const ms = minutes * 60 * 1000;

    console.log(boldText(gradient.cristal(`[session] Guard bật — tự check mỗi ${minutes} phút`)));

    // first check shortly after login (avoid hammering FB immediately)
    setTimeout(() => runCheck().catch(() => {}), 15_000);
    checkTimer = setInterval(() => {
        runCheck().catch(() => {});
    }, ms);

    return { intervalMinutes: minutes };
}

function stopSessionGuard() {
    if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
    }
}

function getSessionGuardInfo() {
    return {
        running: Boolean(checkTimer),
        dead,
        consecutiveFails,
        lastOkAt,
        lastCheckAt,
        lastError
    };
}

module.exports = {
    startSessionGuard,
    stopSessionGuard,
    getSessionGuardInfo,
    runCheck,
    isDeadError
};
