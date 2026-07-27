const delayMs = () => Math.max(0, parseInt(process.env.SEND_DELAY_MS || '2500', 10));
const attachmentExtraMs = () => Math.max(0, parseInt(process.env.SEND_ATTACHMENT_EXTRA_MS || '2000', 10));

let chain = Promise.resolve();
let lastSendAt = 0;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function hasAttachment(message) {
    if (!message || typeof message !== 'object') return false;
    return Boolean(message.attachment);
}

function enqueueSend(api, message, threadID, callback) {
    const job = async () => {
        const wait = delayMs() + (hasAttachment(message) ? attachmentExtraMs() : 0);
        const since = Date.now() - lastSendAt;
        if (lastSendAt && since < wait) {
            await sleep(wait - since);
        }

        return new Promise((resolve) => {
            try {
                api.sendMessage(message, threadID, (err, info) => {
                    lastSendAt = Date.now();
                    if (typeof callback === 'function') {
                        try {
                            callback(err, info);
                        } catch (_) {}
                    }
                    resolve({ err, info });
                });
            } catch (e) {
                lastSendAt = Date.now();
                if (typeof callback === 'function') {
                    try {
                        callback(e);
                    } catch (_) {}
                }
                resolve({ err: e, info: null });
            }
        });
    };

    const result = chain.then(job, job);
    chain = result.catch(() => {});
    return result;
}

function createQueuedApi(api) {
    return new Proxy(api, {
        get(target, prop, receiver) {
            if (prop === 'sendMessage') {
                return (message, threadID, callback) => enqueueSend(target, message, threadID, callback);
            }
            const val = Reflect.get(target, prop, receiver);
            if (typeof val === 'function') {
                return val.bind(target);
            }
            return val;
        }
    });
}

module.exports = {
    enqueueSend,
    createQueuedApi,
    delayMs,
    attachmentExtraMs
};
