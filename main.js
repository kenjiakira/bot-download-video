require('./utils/patchFS');
require('./utils/polyfillWebGlobals');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const gradient = require('gradient-string');
const { handleListenEvents } = require('./utils/listen');
const { logSummary } = require('./utils/ensureFiles');
const { startWebServer, setBotReady } = require('./utils/webServer');

const boldText = (text) => chalk.bold(text);

/** On Render: set APPSTATE env to raw JSON if you cannot upload appstate.json */
function ensureAppStateFile(appstatePath) {
    if (fs.existsSync(appstatePath)) return appstatePath;

    const raw = process.env.APPSTATE || process.env.APPSTATE_JSON;
    if (!raw || !raw.trim()) return appstatePath;

    try {
        const parsed = JSON.parse(raw);
        fs.writeFileSync(appstatePath, JSON.stringify(parsed, null, 2), 'utf8');
        console.log(boldText(gradient.cristal(`Wrote appstate from env → ${appstatePath}`)));
    } catch (e) {
        console.error(boldText(gradient.passion('Invalid APPSTATE env JSON:')), e.message);
        process.exit(1);
    }
    return appstatePath;
}

const adminConfig = JSON.parse(fs.readFileSync('admin.json', 'utf8'));
const fcaName = adminConfig.FCA || 'hut-chat-api';
const configPath = path.join(__dirname, 'logins', fcaName, 'config.json');
let config = { APPSTATE_PATH: './appstate.json' };
try {
    if (fs.existsSync(configPath)) {
        config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    }
} catch (e) {
    console.warn('Could not load FCA config from', configPath, e.message);
}

const proxyList = fs.existsSync('./utils/prox.txt')
    ? fs.readFileSync('./utils/prox.txt', 'utf-8').split('\n').filter(Boolean)
    : [];
const proxy = proxyList.length
    ? proxyList[Math.floor(Math.random() * proxyList.length)]
    : null;

const login = require(path.join(__dirname, 'logins', fcaName, 'index.js'));

global.cc = {
    admin: 'admin.json',
    adminBot: adminConfig.adminUIDs || [],
    modBot: adminConfig.moderatorUIDs || [],
    prefix: adminConfig.prefix || '/',
    developer: adminConfig.ownerName,
    botName: adminConfig.botName,
    ownerLink: adminConfig.facebookLink,
    resend: adminConfig.resend,
    proxy,
    module: { commands: {} },
    cooldowns: {},
    getCurrentPrefix: () => global.cc.prefix
};

const loadEventCommands = () => {
    const eventCommands = {};
    const eventsDir = path.join(__dirname, 'events');
    if (!fs.existsSync(eventsDir)) return eventCommands;

    fs.readdirSync(eventsDir).sort().forEach((file) => {
        if (!file.endsWith('.js')) return;
        try {
            const eventCommand = require(`./events/${file}`);
            eventCommands[eventCommand.name] = eventCommand;
            console.log(boldText(gradient.pastel(`[ ${eventCommand.name} ] Auto-download event ready`)));
        } catch (error) {
            console.error(boldText(gradient.passion(`[ ${file} ] Failed to load event:`)), error.message);
        }
    });
    return eventCommands;
};

(async () => {
    try {
        // Start HTTP first so Render health checks / UptimeRobot always get a response
        await startWebServer();

        const startBot = async () => {
            const appstatePath = config.APPSTATE_PATH || adminConfig.appstate || './appstate.json';

            try {
                const { checkAppStateBeforeLogin, getSyncConfig, isSyncEnabled } = require('./utils/appstateSync');
                const syncCfg = getSyncConfig();
                if (syncCfg.enabled) {
                    console.log(boldText(gradient.cristal('Checking appstate from JSONBin.io...')));
                    const updated = await checkAppStateBeforeLogin();
                    if (updated) {
                        console.log(boldText(gradient.retro('Appstate updated, restarting...')));
                        return;
                    }
                } else if (isSyncEnabled() && !syncCfg.url) {
                    console.warn(
                        boldText(
                            gradient.passion(
                                'APPSTATE_SYNC enabled but missing JSONBIN_BIN_ID or APPSTATE_SYNC_URL'
                            )
                        )
                    );
                }
            } catch (error) {
                console.error(boldText(gradient.passion('Appstate sync failed:')), error.message);
            }

            console.log(boldText(gradient.retro('Logging via AppState...')));

            ensureAppStateFile(appstatePath);
            if (!fs.existsSync(appstatePath)) {
                console.error(
                    boldText(
                        gradient.passion(
                            `Missing appstate at ${appstatePath}. Set JSONBIN_BIN_ID + JSONBIN_MASTER_KEY on Render, or add appstate.json locally`
                        )
                    )
                );
                process.exit(1);
            }

            const loginOptions = {
                appState: JSON.parse(fs.readFileSync(appstatePath, 'utf8')),
                logLevel: 'silent',
                forceLogin: true,
                userAgent:
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                autoMarkDelivery: false,
                autoMarkRead: false
            };

            login(loginOptions, async function (err, api) {
                if (err) {
                    console.error(boldText(gradient.passion('FCA LOGIN ERROR:')));
                    if (typeof err === 'object') {
                        console.error(boldText(gradient.passion(JSON.stringify(err))));
                    } else {
                        console.error(boldText(gradient.passion(String(err))));
                    }

                    if (err.error === 'login-approval' || err.error === 'Wrong username/password.') {
                        console.log(boldText(gradient.cristal('Retrying login in 5s...')));
                        await new Promise((resolve) => setTimeout(resolve, 5000));
                        return startBot();
                    }
                    return;
                }

                try {
                    const { startAutoRestart } = require('./utils/autoRestart');
                    startAutoRestart(api);
                    console.log(boldText(gradient.cristal('Auto Restart enabled')));
                } catch (error) {
                    console.error('Failed to initialize Auto Restart:', error.message);
                }

                console.log(boldText(gradient.retro('LOGGED IN VIA APPSTATE')));
                if (proxy) {
                    console.log(boldText(gradient.retro('Proxy: ' + proxy)));
                }

                try {
                    const { startAppStateSync, getSyncConfig } = require('./utils/appstateSync');
                    const syncCfg = getSyncConfig();
                    if (syncCfg.enabled) {
                        const interval = parseInt(process.env.APPSTATE_SYNC_INTERVAL, 10) || 15;
                        const enablePeriodic = process.env.APPSTATE_SYNC_ENABLE_PERIODIC !== 'false';
                        startAppStateSync(null, interval, null, enablePeriodic);
                    }
                } catch (error) {
                    console.error(boldText(gradient.passion('Appstate sync failed:')), error.message);
                }

                console.log(boldText(gradient.morning('━━━━━━━[ EVENTS ]━━━━━━━━━━━')));
                const eventCommands = loadEventCommands();

                console.log(boldText(gradient.cristal(`BOT: ${adminConfig.botName || 'Download Bot'}`)));
                console.log(boldText(gradient.cristal('Mode: auto-download only (send a link)')));

                if (fs.existsSync('./database/autoRestart.json')) {
                    try {
                        const autoRestartData = JSON.parse(
                            fs.readFileSync('./database/autoRestart.json', 'utf8')
                        );
                        if (autoRestartData.type === 'auto') {
                            console.log(
                                boldText(
                                    gradient.atlas(
                                        `Restarted at ${new Date(autoRestartData.timestamp).toLocaleString('vi-VN')}`
                                    )
                                )
                            );
                        }
                        fs.unlinkSync('./database/autoRestart.json');
                    } catch (error) {
                        console.error('Error processing autoRestart.json:', error.message);
                    }
                }

                logSummary();
                setBotReady(true);
                console.error(boldText(gradient.summer('[ BOT IS LISTENING — auto-download ]')));

                handleListenEvents(api, {}, eventCommands);
            });
        };

        process.on('SIGINT', () => {
            console.log(boldText(gradient.cristal('\nShutting down...')));
            process.exit(0);
        });

        process.on('uncaughtException', (err) => {
            if (
                err?.error === 3252001 ||
                err?.errorSummary?.includes('Bạn tạm thời bị chặn') ||
                (err?.error && err?.blockedAction)
            ) {
                return;
            }

            if (err.code === 'ENOENT' && err.path && err.path.endsWith('.json')) {
                try {
                    const { ensureFile } = require('./utils/ensureFiles');
                    ensureFile(err.path, {});
                    return;
                } catch (_) {}
            }

            if (err.code === 'ENOTFOUND' && err.hostname === 'www.facebook.com') {
                console.log(boldText(gradient.cristal('Facebook connection lost')));
            } else {
                console.error('Uncaught Exception:', err?.message || err?.errorSummary || err);
            }
        });

        process.on('unhandledRejection', (reason) => {
            if (
                reason?.error === 3252001 ||
                reason?.errorSummary?.includes('Bạn tạm thời bị chặn') ||
                (reason?.error && reason?.blockedAction)
            ) {
                return;
            }

            if (reason && reason.code === 'ENOENT' && reason.path && reason.path.endsWith('.json')) {
                try {
                    const { ensureFile } = require('./utils/ensureFiles');
                    ensureFile(reason.path, {});
                    return;
                } catch (_) {}
            }

            if (reason && reason.code === 'ENOTFOUND' && reason.hostname === 'www.facebook.com') {
                console.log(boldText(gradient.cristal('Facebook connection lost')));
            } else {
                console.error(
                    'Unhandled Rejection:',
                    reason?.message || reason?.errorSummary || reason
                );
            }
        });

        await startBot();
    } catch (error) {
        console.error('Bot startup error:', error);
        process.exit(1);
    }
})();
