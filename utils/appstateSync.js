require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const gradient = require('gradient-string');

const APPSTATE_PATH = path.join(__dirname, '..', 'appstate.json');
const LAST_CHECK_FILE = path.join(__dirname, '..', '.appstate-last-check.json');
const SYNC_CONFIG_PATH = path.join(__dirname, '..', 'database', 'json', 'appstateSync.json');

let checkInterval = null;
let lastContentHash = null;

function ensureSyncConfigDir() {
    const dir = path.dirname(SYNC_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function loadSyncConfig() {
    try {
        ensureSyncConfigDir();
        if (fs.existsSync(SYNC_CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(SYNC_CONFIG_PATH, 'utf8'));
            return { enabled: data.enabled !== false, fromFile: true };
        }
    } catch (e) {
        // ignore
    }
    return { enabled: null, fromFile: false };
}

function saveSyncConfig(config) {
    try {
        ensureSyncConfigDir();
        fs.writeFileSync(SYNC_CONFIG_PATH, JSON.stringify({ enabled: config.enabled }, null, 2), 'utf8');
    } catch (e) {
        console.error(boldText(gradient.passion('❌ Không thể lưu cấu hình appstateSync:')), e.message);
    }
}

function boldText(text) {
    return chalk.bold(text);
}

function getSyncConfig() {
    const binId = (process.env.JSONBIN_BIN_ID || process.env.APPSTATE_SYNC_BIN_ID || '').trim();
    const masterKey = process.env.JSONBIN_MASTER_KEY || process.env.APPSTATE_SYNC_API_KEY || null;
    const accessKey = process.env.JSONBIN_ACCESS_KEY || null;

    let url = (process.env.APPSTATE_SYNC_URL || '').trim();
    if (!url && binId) {
        url = `https://api.jsonbin.io/v3/b/${binId}/latest`;
    }

    const apiKey = masterKey ? String(masterKey).trim() : accessKey ? String(accessKey).trim() : null;
    const keyType = masterKey ? 'master' : accessKey ? 'access' : null;

    return {
        url,
        apiKey,
        keyType,
        binId: binId || null,
        enabled: isSyncEnabled() && Boolean(url)
    };
}

async function fetchAppStateFromURL(url, apiKey = null, keyType = 'master') {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        if (apiKey) {
            if (keyType === 'access') {
                headers['X-Access-Key'] = apiKey;
            } else {
                headers['X-Master-Key'] = apiKey;
            }
            console.log(boldText(gradient.cristal('🔑 JSONBin.io — đang dùng API key')));
        } else {
            console.log(boldText(gradient.passion('⚠️ Không có API key — chỉ dùng được public bin')));
        }
        
        const response = await axios.get(url, {
            timeout: 30000,
            headers: headers,
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        if (response.status === 401) {
            console.error(boldText(gradient.passion('❌ Lỗi 401: Unauthorized')));
            console.error(boldText(gradient.passion('💡 Có thể do:')));
            console.error(boldText(gradient.passion('   - API key không đúng hoặc thiếu')));
            console.error(boldText(gradient.passion('   - Bin là private nhưng không có API key')));
            console.error(boldText(gradient.passion('   - API key đã hết hạn hoặc bị thu hồi')));
            if (apiKey) {
                console.error(boldText(gradient.passion(`   - API key hiện tại: ${apiKey.substring(0, 10)}...`)));
            }
            throw new Error(`401 Unauthorized - Kiểm tra API key trong .env (APPSTATE_SYNC_API_KEY)`);
        }
        
        if (response.status === 404) {
            throw new Error(`404 Not Found - URL không tồn tại: ${url}`);
        }
        
        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        
        let content = response.data;
        if (content && content.record) {
            content = content.record;
            console.log(boldText(gradient.cristal('✅ Đã tải thành công từ JSONBin.io')));
        } else if (content && content.data) {
            content = content.data;
            console.log(boldText(gradient.cristal('✅ Đã tải thành công (format có data wrapper)')));
        } else {
            console.log(boldText(gradient.cristal('✅ Đã tải thành công')));
        }
        
        if (typeof content === 'string') {
            content = content.trim();
        }
        
        return content;
    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            const statusText = error.response.statusText;
            const data = error.response.data;
            
            console.error(boldText(gradient.passion(`❌ HTTP Error ${status}: ${statusText}`)));
            if (data) {
                console.error(boldText(gradient.passion(`📄 Response: ${JSON.stringify(data).substring(0, 200)}`)));
            }
            
            if (status === 401) {
                throw new Error(`401 Unauthorized - Kiểm tra APPSTATE_SYNC_API_KEY trong .env`);
            }
            throw new Error(`HTTP ${status}: ${statusText}`);
        }
        
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            throw error;
        }
        
        throw new Error(`Không thể tải từ URL: ${error.message}`);
    }
}

function validateAppState(content) {
    try {
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        
        if (!Array.isArray(parsed)) {
            throw new Error('Nội dung phải là một mảng JSON (array)');
        }
        
        for (const item of parsed) {
            if (!item.key || !item.value || !item.domain) {
                throw new Error('Cấu trúc appstate không hợp lệ');
            }
        }
        
        return parsed;
    } catch (error) {
        if (error.message.includes('JSON')) {
            throw new Error(`JSON không hợp lệ: ${error.message}`);
        }
        throw error;
    }
}

function getContentHash(content) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(JSON.stringify(content)).digest('hex');
}


function saveAppState(content) {
    try {
        const formatted = JSON.stringify(content, null, 4);
        fs.writeFileSync(APPSTATE_PATH, formatted, 'utf8');
        
        const hash = getContentHash(content);
        fs.writeFileSync(LAST_CHECK_FILE, JSON.stringify({ hash, timestamp: Date.now() }), 'utf8');
        lastContentHash = hash;
        
        return true;
    } catch (error) {
        throw new Error(`Không thể lưu file: ${error.message}`);
    }
}

function loadLastCheck() {
    try {
        if (fs.existsSync(LAST_CHECK_FILE)) {
            const data = JSON.parse(fs.readFileSync(LAST_CHECK_FILE, 'utf8'));
            return data.hash;
        }
    } catch (error) {
    }
    return null;
}

async function checkAndUpdateAppState(syncURL, apiKey = null, shouldRestart = false, keyType = 'master', rethrow = false) {
    if (!syncURL) {
        return false;
    }

    try {
        console.log(boldText(gradient.cristal('🔄 Đang kiểm tra appstate từ JSONBin.io...')));

        const content = await fetchAppStateFromURL(syncURL, apiKey, keyType);
        
        const validatedContent = validateAppState(content);
        
        let currentFileHash = null;
        if (fs.existsSync(APPSTATE_PATH)) {
            try {
                const currentFileContent = JSON.parse(fs.readFileSync(APPSTATE_PATH, 'utf8'));
                currentFileHash = getContentHash(currentFileContent);
            } catch (error) {
                currentFileHash = null;
            }
        }
        
        const newContentHash = getContentHash(validatedContent);
        
        if (currentFileHash && currentFileHash === newContentHash) {
            console.log(boldText(gradient.cristal('✅ Appstate không có thay đổi')));
            return false;
        }
        
        console.log(boldText(gradient.retro('📥 Phát hiện appstate mới, đang cập nhật...')));
        saveAppState(validatedContent);
        
        console.log(boldText(gradient.retro('✅ Đã cập nhật appstate.json thành công!')));
        
        if (shouldRestart) {
            console.log(boldText(gradient.retro('🔄 Đang khởi động lại bot để áp dụng appstate mới...')));
            setTimeout(() => {
                process.exit(1);
            }, 2000);
        }
        
        return true;
        
    } catch (error) {
        console.error(boldText(gradient.passion('❌ Lỗi khi đồng bộ appstate:')), error.message);
        if (rethrow) throw error;
        return false;
    }
}

async function syncAppStateFromRemote(shouldRestart = false) {
    const { url, apiKey, keyType, enabled } = getSyncConfig();
    if (!enabled) return false;
    return checkAndUpdateAppState(url, apiKey, shouldRestart, keyType || 'master');
}

/**
 * Sync JSONBin → local appstate.json; restart when updated (or forceRestart).
 * @returns {{ ok: boolean, updated?: boolean, restarting?: boolean, message?: string, error?: string }}
 */
async function applyAppStateFromRemote({ forceRestart = false } = {}) {
    const cfg = getSyncConfig();
    if (!isSyncEnabled() || !cfg.url) {
        return { ok: false, error: 'Chưa bật sync JSONBin' };
    }

    try {
        const updated = await checkAndUpdateAppState(
            cfg.url,
            cfg.apiKey,
            false,
            cfg.keyType || 'master',
            true
        );

        if (updated) {
            return {
                ok: true,
                updated: true,
                restarting: true,
                message: 'Đã cập nhật appstate — bot đang khởi động lại…'
            };
        }

        if (forceRestart) {
            return {
                ok: true,
                updated: false,
                restarting: true,
                message: 'Appstate không đổi — vẫn restart theo yêu cầu…'
            };
        }

        return {
            ok: true,
            updated: false,
            restarting: false,
            message: 'Appstate không đổi — không cần restart'
        };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Push local appstate lên JSONBin để không bị poll ghi đè bản cũ.
 */
async function pushAppStateToJsonBin(content) {
    const cfg = getSyncConfig();
    if (!cfg.binId || !cfg.apiKey) {
        return { ok: false, skipped: true, error: 'Chưa cấu hình JSONBIN_BIN_ID / MASTER_KEY' };
    }

    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    if (cfg.keyType === 'access') headers['X-Access-Key'] = cfg.apiKey;
    else headers['X-Master-Key'] = cfg.apiKey;

    const url = `https://api.jsonbin.io/v3/b/${cfg.binId}`;
    console.log(boldText(gradient.cristal('⬆️ Đẩy appstate lên JSONBin...')));

    const response = await axios.put(url, content, {
        timeout: 30000,
        headers,
        validateStatus: (status) => status < 500
    });

    if (response.status !== 200) {
        throw new Error(`JSONBin PUT HTTP ${response.status}`);
    }

    console.log(boldText(gradient.retro('✅ Đã cập nhật JSONBin theo appstate mới')));
    return { ok: true };
}

/**
 * Paste appstate JSON (array) từ dashboard → validate → lưu → đẩy JSONBin → restart.
 */
async function applyAppStateFromPaste(raw) {
    try {
        let content = raw;
        if (typeof content === 'string') {
            content = content.trim();
            if (!content) return { ok: false, error: 'Chưa dán appstate' };
            content = JSON.parse(content);
        }
        if (content && content.record) content = content.record;
        if (content && content.data && !Array.isArray(content)) content = content.data;

        const validated = validateAppState(content);

        let currentHash = null;
        if (fs.existsSync(APPSTATE_PATH)) {
            try {
                currentHash = getContentHash(JSON.parse(fs.readFileSync(APPSTATE_PATH, 'utf8')));
            } catch (_) {}
        }
        const newHash = getContentHash(validated);
        const updated = !currentHash || currentHash !== newHash;

        saveAppState(validated);
        console.log(boldText(gradient.retro('✅ Đã lưu appstate từ dashboard paste')));

        let binPushed = false;
        let binError = null;
        try {
            const push = await pushAppStateToJsonBin(validated);
            binPushed = Boolean(push.ok);
            if (push.skipped) {
                console.log(
                    boldText(gradient.passion('⚠️ Paste xong nhưng chưa đẩy JSONBin (thiếu config) — tắt APPSTATE_SYNC hoặc cập nhật bin tay'))
                );
            }
        } catch (e) {
            binError = e.message;
            console.error(boldText(gradient.passion('❌ Đẩy JSONBin thất bại:')), e.message);
        }

        // Nếu có JSONBin sync bật mà push fail → không restart (tránh boot rồi bị bin cũ ghi đè)
        const cfg = getSyncConfig();
        if (cfg.enabled && cfg.binId && !binPushed) {
            return {
                ok: false,
                error: `Đã lưu file local nhưng đẩy JSONBin lỗi: ${binError || 'unknown'}. Sửa key/bin rồi paste lại — nếu restart lúc này bot sẽ kéo appstate cũ từ bin.`
            };
        }

        const msgParts = [
            updated ? 'Đã lưu appstate mới' : 'Appstate giống file cũ',
            binPushed ? '· đã cập nhật JSONBin' : '',
            '— bot đang khởi động lại…'
        ].filter(Boolean);

        return {
            ok: true,
            updated,
            binPushed,
            restarting: true,
            message: msgParts.join(' ')
        };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

async function checkAppStateBeforeLogin(syncURL = null, apiKey = null) {
    const cfg = getSyncConfig();
    const url = syncURL || cfg.url;
    const key = apiKey !== undefined && apiKey !== null ? apiKey : cfg.apiKey;
    const keyType = cfg.keyType || 'master';

    if (!url || !isSyncEnabled()) {
        return false;
    }

    try {
        console.log(boldText(gradient.cristal('🔍 Kiểm tra appstate từ JSONBin.io trước khi đăng nhập...')));
        const updated = await checkAndUpdateAppState(url, key, false, keyType);
        return updated;
    } catch (error) {
        console.error(boldText(gradient.passion('❌ Lỗi kiểm tra appstate:')), error.message);
        return false;
    }
}

function isSyncEnabled() {
    const config = loadSyncConfig();
    if (config.fromFile) {
        return config.enabled === true;
    }
    const v = (process.env.APPSTATE_SYNC_ENABLED || 'true').toString().toLowerCase();
    return v !== 'false' && v !== '0' && v !== 'off' && v !== 'no';
}

function setSyncEnabled(enabled) {
    saveSyncConfig({ enabled: !!enabled });
    if (!enabled) {
        stopAppStateSync();
    }
}

function stopAppStateSync() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
        console.log(boldText(gradient.passion('⏸️ Đã dừng đồng bộ appstate định kỳ.')));
    }
}

function startAppStateSync(syncURL = null, intervalMinutes = 5, apiKey = null, enablePeriodic = true) {
    const cfg = getSyncConfig();
    const url = syncURL || cfg.url;
    const key = apiKey !== undefined && apiKey !== null ? apiKey : cfg.apiKey;
    const enabled = isSyncEnabled();

    if (!url || !enabled) {
        if (url && !enabled) {
            console.log(boldText(gradient.passion('⏸️ Appstate sync đã tắt (APPSTATE_SYNC_ENABLED=false)')));
        }
        return;
    }

    console.log(boldText(gradient.cristal('🔄 Khởi động đồng bộ appstate từ JSONBin.io...')));
    console.log(boldText(gradient.cristal(`📎 URL: ${url}`)));
    console.log(boldText(gradient.cristal(`⏱️  Chu kỳ kiểm tra: ${intervalMinutes} phút`)));

    checkAndUpdateAppState(url, key, false, cfg.keyType || 'master').catch((err) => {
        console.error(boldText(gradient.passion('❌ Lỗi kiểm tra lần đầu:')), err.message);
    });

    if (enablePeriodic) {
        const intervalMs = intervalMinutes * 60 * 1000;
        checkInterval = setInterval(async () => {
            try {
                const updated = await checkAndUpdateAppState(url, key, true, cfg.keyType || 'master');
                if (updated) {
                    console.log(boldText(gradient.retro('🔄 Bot sẽ tự động restart sau 2 giây...')));
                }
            } catch (err) {
                console.error(boldText(gradient.passion('❌ Lỗi kiểm tra định kỳ:')), err.message);
            }
        }, intervalMs);
        console.log(
            boldText(gradient.cristal(`✅ JSONBin sync bật (mỗi ${intervalMinutes} phút, auto-restart khi đổi appstate)`))
        );
    } else {
        console.log(boldText(gradient.cristal('✅ Đã chạy kiểm tra appstate một lần (đồng bộ định kỳ đã tắt)')));
    }
}

module.exports = {
    startAppStateSync,
    checkAndUpdateAppState,
    checkAppStateBeforeLogin,
    syncAppStateFromRemote,
    applyAppStateFromRemote,
    applyAppStateFromPaste,
    pushAppStateToJsonBin,
    getSyncConfig,
    isSyncEnabled,
    setSyncEnabled,
    stopAppStateSync
};

