module.exports = {
    name: 'ping',
    info: 'Kiểm tra bot còn sống',
    usedby: 0,
    category: 'System',
    onPrefix: true,
    cooldowns: 3,
    nickName: ['pong', 'latency'],

    onLaunch: async function ({ api, event }) {
        const start = Date.now();
        const msg = await api.sendMessage('🏓 Pong...', event.threadID, event.messageID);
        const latency = Date.now() - start;
        const uptimeSec = Math.floor(process.uptime());
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;

        const body =
            `🏓 Pong!\n` +
            `⏱️ Latency: ${latency}ms\n` +
            `🟢 Uptime: ${h}h ${m}m ${s}s`;

        if (msg && msg.messageID && typeof api.editMessage === 'function') {
            try {
                await api.editMessage(body, msg.messageID, event.threadID);
                return;
            } catch (_) {}
        }

        return api.sendMessage(body, event.threadID, event.messageID);
    }
};
