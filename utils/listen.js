const gradient = require('gradient-string');

/**
 * Listen for Messenger events and dispatch to auto-download (atd) only.
 */
const handleListenEvents = (api, _commands, eventCommands) => {
    api.setOptions({ listenEvents: true });

    api.listenMqtt(async (err, event) => {
        if (err) {
            console.error(gradient.passion(err));
            return;
        }

        if (event.type !== 'message' && event.type !== 'message_reply') {
            return;
        }

        if (!event.body) return;

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
