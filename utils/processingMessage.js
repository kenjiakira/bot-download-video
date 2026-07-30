'use strict';

function extractMessageId(payload) {
    if (!payload) return null;
    if (payload.info?.messageID) return payload.info.messageID;
    if (payload.messageID) return payload.messageID;
    if (Array.isArray(payload) && payload[0]?.messageID) return payload[0].messageID;
    return null;
}

function promisifyUnsend(api, messageID) {
    return new Promise((resolve) => {
        if (!messageID || typeof api.unsendMessage !== 'function') {
            return resolve(false);
        }
        try {
            api.unsendMessage(messageID, (err) => {
                if (err) {
                    const detail = err?.error || err?.message || String(err);
                    console.warn('[processingMsg] unsend failed:', detail);
                    return resolve(false);
                }
                resolve(true);
            });
        } catch (err) {
            console.warn('[processingMsg] unsend error:', err?.message || err);
            resolve(false);
        }
    });
}

async function sendProcessingMessage(api, threadID, message = '⏳ Đang xử lý...') {
    const noop = async () => false;

    try {
        const result = await api.sendMessage(message, threadID);
        if (result?.err) {
            throw result.err;
        }

        const messageID = extractMessageId(result);
        if (!messageID) {
            console.warn('[processingMsg] send OK nhưng không có messageID — không unsend được');
            return { messageID: null, remove: noop, removed: false };
        }

        let removed = false;
        return {
            messageID,
            async remove() {
                if (removed || !messageID) return false;
                removed = true;
                return promisifyUnsend(api, messageID);
            },
            get removed() {
                return removed;
            }
        };
    } catch (err) {
        console.error('[processingMsg] send failed:', err?.error || err?.message || err);
        return { messageID: null, remove: noop, removed: false };
    }
}

module.exports = {
    sendProcessingMessage,
    extractMessageId,
    promisifyUnsend
};
