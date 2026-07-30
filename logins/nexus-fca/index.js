"use strict";

const fs = require("fs");
const path = require("path");
const nexusLogin = require("nexus-fca");

const configPath = path.join(__dirname, "config.json");
let config = { APPSTATE_PATH: "./appstate.json", FCA_OPTIONS: {} };
if (fs.existsSync(configPath)) {
    try {
        config = { ...config, ...JSON.parse(fs.readFileSync(configPath, "utf8")) };
    } catch (e) {
        console.error("[nexus-fca] config error:", e.message);
    }
}

function login(loginData, options, callback) {
    if (typeof options === "function") {
        callback = options;
        options = {};
    }

    let returnPromise;
    if (!callback) {
        returnPromise = new Promise((resolve, reject) => {
            callback = (err, api) => {
                if (err) reject(err);
                else resolve(api);
            };
        });
    }

    let appState = null;
    let loginDataOptions = {};

    if (loginData) {
        if (loginData.appState) {
            appState = loginData.appState;
            const { appState: _, ...rest } = loginData;
            loginDataOptions = rest;
        } else if (Array.isArray(loginData)) {
            appState = loginData;
        }
    }

    if (!appState) {
        const error = { error: "No appState given. Nexus-fCA requires appState." };
        if (returnPromise) return Promise.reject(error);
        return callback(error);
    }

    const fcaOpts = config.FCA_OPTIONS || {};
    const merged = {
        logLevel: "silent",
        forceLogin: false,
        autoMarkDelivery: false,
        autoMarkRead: false,
        listenEvents: true,
        selfListen: false,
        updatePresence: false,
        online: false,
        autoReconnect: true,
        randomUserAgent: false,
        emitReady: false,
        userAgent:
            process.env.FB_USER_AGENT ||
            fcaOpts.userAgent ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ...fcaOpts,
        ...loginDataOptions,
        ...(options || {})
    };

    const proxy =
        merged.proxy ||
        process.env.NEXUS_PROXY ||
        process.env.PROXY_URL ||
        (global.cc && global.cc.proxy);
    if (proxy) merged.proxy = proxy;

    if (process.env.NEXUS_BYPASS_REGION) {
        merged.bypassRegion = process.env.NEXUS_BYPASS_REGION;
    }

    nexusLogin({ appState }, merged, (err, api) => {
        if (err) return callback(err);

        if (api && typeof api.setParallelSend === "function") {
            const parallel = parseInt(process.env.NEXUS_PARALLEL_SEND || "1", 10);
            api.setParallelSend(Math.max(1, Math.min(parallel, 3)));
        }
        if (api && typeof api.setFastSend === "function") {
            api.setFastSend(process.env.NEXUS_FAST_SEND === "true");
        }
        if (api && typeof api.setFastSend === "function" && process.env.NEXUS_FAST_SEND !== "true") {
            api.setFastSend(false);
        }

        callback(null, api);
    });

    return returnPromise;
}

module.exports = login;
