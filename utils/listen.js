const gradient = require('gradient-string');

const handleListenEvents = (api, commands = {}, eventCommands = {}) => {
    api.setOptions({ listenEvents: true });

    const prefix = () => (global.cc && global.cc.prefix) || '/';

    const logEvent = (level, message) => {
        console.log(gradient.cristal(`[event] ${message}`));
        try {
            require('./webServer').pushLog(level, message);
        } catch (_) {}
    };

    api.listenMqtt(async (err, event) => {
        if (err) {
            console.error(gradient.passion(err));
            try {
                require('./webServer').pushLog('error', `MQTT: ${err?.message || err}`);
            } catch (_) {}
            return;
        }

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
                logEvent('warn', `Unknown command: ${pfx}${commandName} · uid=${event.senderID} · thread=${event.threadID}`);
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
