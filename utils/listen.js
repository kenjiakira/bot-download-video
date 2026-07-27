const gradient = require('gradient-string');

const handleListenEvents = (api, commands = {}, eventCommands = {}) => {
    api.setOptions({ listenEvents: true, autoReconnect: true });

    const prefix = () => (global.cc && global.cc.prefix) || '/';

    let lastMqttErrorLogAt = 0;
    let mqttWasDown = false;

    const web = () => {
        try {
            return require('./webServer');
        } catch (_) {
            return null;
        }
    };

    const logEvent = (level, message) => {
        console.log(gradient.cristal(`[event] ${message}`));
        const w = web();
        if (w) w.pushLog(level, message);
    };

    const markMqttUp = () => {
        const w = web();
        if (!w) return;
        w.setMqttStatus({
            connected: true,
            lastEventAt: Date.now(),
            lastError: null
        });
        if (mqttWasDown) {
            mqttWasDown = false;
            w.pushLog('info', 'MQTT listen reconnect OK — nhận tin trở lại');
        }
    };

    const markMqttDown = (err) => {
        const w = web();
        if (!w) return;
        const msg = err?.error || err?.message || String(err);
        mqttWasDown = true;
        const prev = w.buildStatusPayload().mqtt || {};
        w.setMqttStatus({
            connected: false,
            lastErrorAt: Date.now(),
            lastError: msg,
            reconnects: (prev.reconnects || 0) + 1
        });

        const now = Date.now();
        if (now - lastMqttErrorLogAt > 30_000) {
            lastMqttErrorLogAt = now;
            w.pushLog('warn', `MQTT down: ${msg} (cookie có thể vẫn OK — bot tạm không nhận tin)`);
        }
    };

    // Ban đầu chưa biết MQTT
    try {
        web()?.setMqttStatus({ connected: null });
    } catch (_) {}

    api.listenMqtt(async (err, event) => {
        if (err) {
            console.error(gradient.passion(err));
            markMqttDown(err);
            return;
        }

        // Có event thật = MQTT đang sống
        markMqttUp();

        if (event.type !== 'message' && event.type !== 'message_reply') {
            return;
        }

        if (!event.body) return;

        const body = event.body.trim();
        const pfx = prefix();

        if (body.startsWith(pfx)) {
            const args = body.slice(pfx.length).trim().split(/\s+/);
            const commandName = (args.shift() || '').toLowerCase();
            if (!commandName) return;

            const command =
                commands[commandName] ||
                Object.values(commands).find(
                    (cmd) => cmd.nickName && cmd.nickName.includes(commandName)
                );

            if (!command || typeof command.onLaunch !== 'function') {
                logEvent(
                    'warn',
                    `Unknown command: ${pfx}${commandName} · uid=${event.senderID} · thread=${event.threadID}`
                );
                return;
            }

            logEvent(
                'cmd',
                `/${command.name} · uid=${event.senderID} · thread=${event.threadID}` +
                    (args.length ? ` · args=${args.join(' ').slice(0, 80)}` : '')
            );

            try {
                await command.onLaunch({
                    api,
                    event,
                    args,
                    prefix: pfx
                });
            } catch (error) {
                console.error(
                    gradient.passion(`Command [${commandName}] error:`),
                    error?.message || error
                );
                logEvent('error', `Command /${commandName} failed: ${error?.message || error}`);
            }
            return;
        }

        const atd = eventCommands && eventCommands.atd;
        if (!atd || typeof atd.onEvents !== 'function') return;

        const urlMatch = body.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
            logEvent(
                'info',
                `autodownload link · uid=${event.senderID} · thread=${event.threadID} · ${urlMatch[0].slice(0, 120)}`
            );
        }

        try {
            await atd.onEvents({ api, event });
        } catch (error) {
            console.error(gradient.passion('Auto-download error:'), error?.message || error);
            logEvent('error', `autodownload failed: ${error?.message || error}`);
        }
    });
};

module.exports = { handleListenEvents };
