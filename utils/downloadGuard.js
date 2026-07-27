const crypto = require('crypto');

const concurrency = () => Math.max(1, parseInt(process.env.DOWNLOAD_CONCURRENCY || '1', 10));
const cooldownMs = () => Math.max(0, parseInt(process.env.DOWNLOAD_COOLDOWN_MS || '120000', 10)); // 2 min
const maxPerThread = () => Math.max(1, parseInt(process.env.DOWNLOAD_MAX_PER_THREAD || '3', 10));
const threadWindowMs = () => Math.max(1000, parseInt(process.env.DOWNLOAD_THREAD_WINDOW_MS || '60000', 10));

let active = 0;
const waiters = [];
const lastUrlHit = new Map(); 
const threadHits = new Map(); 

function normalizeUrl(url) {
    try {
        const u = new URL(url);
        u.hash = '';
        ['fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'igshid', 'tt_from'].forEach((k) =>
            u.searchParams.delete(k)
        );
        return u.toString();
    } catch (_) {
        return String(url || '').split('?')[0];
    }
}

function urlKey(threadID, url) {
    const n = normalizeUrl(url);
    return crypto.createHash('md5').update(`${threadID}:${n}`).digest('hex');
}

function pruneThreadHits(threadID, now) {
    const arr = threadHits.get(threadID) || [];
    const kept = arr.filter((t) => now - t < threadWindowMs());
    threadHits.set(threadID, kept);
    return kept;
}

/**
 * @returns {{ ok: true } | { ok: false, reason: string, retryAfterSec?: number }}
 */
function canDownload(threadID, url) {
    const now = Date.now();
    const key = urlKey(threadID, url);
    const last = lastUrlHit.get(key);
    if (last && now - last < cooldownMs()) {
        return {
            ok: false,
            reason: 'cooldown',
            retryAfterSec: Math.ceil((cooldownMs() - (now - last)) / 1000)
        };
    }

    const hits = pruneThreadHits(threadID, now);
    if (hits.length >= maxPerThread()) {
        const oldest = hits[0];
        return {
            ok: false,
            reason: 'thread_limit',
            retryAfterSec: Math.ceil((threadWindowMs() - (now - oldest)) / 1000)
        };
    }

    return { ok: true };
}

function markDownload(threadID, url) {
    const now = Date.now();
    lastUrlHit.set(urlKey(threadID, url), now);
    const hits = pruneThreadHits(threadID, now);
    hits.push(now);
    threadHits.set(threadID, hits);
}

function acquireSlot() {
    if (active < concurrency()) {
        active += 1;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        waiters.push(resolve);
    }).then(() => {
        active += 1;
    });
}

function releaseSlot() {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
}

async function withDownloadSlot(fn) {
    await acquireSlot();
    try {
        return await fn();
    } finally {
        releaseSlot();
    }
}

module.exports = {
    canDownload,
    markDownload,
    withDownloadSlot,
    normalizeUrl,
    concurrency,
    cooldownMs
};
