const gradient = require('gradient-string');

const handleListenEvents = (api, commands = {}, eventCommands = {}) => {
    api.setOptions({ listenEvents: true });

    const prefix = () => (global.cc && global.cc.prefix) || '/';

    api.listenMqtt(async (err, event) => {
        if (err) {
            console.error(gradient.passion(err));
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

            if (!command || typeof command.onLaunch !== 'function') return;

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
            }
            return;
        }

        const atd = eventCommands && eventCommands.atd;
        if (!atd || typeof atd.onEvents !== 'function') return;

        try {
            await atd.onEvents({ api, event });
        } catch (error) {
            console.error(gradient.passion('Auto-download error:'), error?.message || error);
        }
    });
};

module.exports = { handleListenEvents };
