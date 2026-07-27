const os = require('os');

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function formatUptime(sec) {
    const s = Math.floor(sec);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h || d) parts.push(`${h}h`);
    parts.push(`${m}m`, `${r}s`);
    return parts.join(' ');
}

module.exports = {
    name: 'device',
    info: 'Xem thông tin máy chủ / runtime của bot',
    usedby: 0,
    category: 'System',
    onPrefix: true,
    cooldowns: 5,
    nickName: ['sys', 'system', 'info', 'server'],

    onLaunch: async function ({ api, event }) {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const cpus = os.cpus() || [];
        const cpuModel = cpus[0] ? cpus[0].model.trim() : 'N/A';
        const load = os.loadavg().map((n) => n.toFixed(2)).join(' / ');

        const body =
            `🖥️ Device Info\n` +
            `━━━━━━━━━━━━━━\n` +
            `🤖 Bot: ${global.cc?.botName || 'Download Bot'}\n` +
            `📦 Host: ${os.hostname()}\n` +
            `💻 Platform: ${os.platform()} (${os.arch()})\n` +
            `🧩 OS: ${os.type()} ${os.release()}\n` +
            `🟢 Node: ${process.version}\n` +
            `⚙️ CPU: ${cpus.length}× ${cpuModel}\n` +
            `📊 Load: ${load}\n` +
            `🧠 RAM: ${formatBytes(usedMem)} / ${formatBytes(totalMem)} ` +
            `(${((usedMem / totalMem) * 100).toFixed(1)}%)\n` +
            `🟢 Free: ${formatBytes(freeMem)}\n` +
            `⏱️ Bot uptime: ${formatUptime(process.uptime())}\n` +
            `🕐 OS uptime: ${formatUptime(os.uptime())}\n` +
            `📁 CWD: ${process.cwd()}\n` +
            `🔌 PID: ${process.pid}`;

        return api.sendMessage(body, event.threadID, event.messageID);
    }
};
