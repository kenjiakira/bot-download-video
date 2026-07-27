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

async function checkAndUpdateAppState(syncURL, apiKey = null, shouldRestart = false, keyType = 'master') {
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
        return false;
    }
}

async function syncAppStateFromRemote(shouldRestart = false) {
    const { url, apiKey, keyType, enabled } = getSyncConfig();
    if (!enabled) return false;
    return checkAndUpdateAppState(url, apiKey, shouldRestart, keyType || 'master');
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
    getSyncConfig,
    isSyncEnabled,
    setSyncEnabled,
    stopAppStateSync
};

