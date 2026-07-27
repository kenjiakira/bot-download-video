require('dotenv').config();

module.exports = {
    ZM_API: {
        BASE_URL: process.env.ZM_API_BASE_URL,
        KEY: process.env.ZM_API_KEY
    },
    CAPCUT_API: {
        BASE_URL: process.env.CAPCUT_API_BASE_URL
    },
    TIKTOK_API: {
        BASE_URL: process.env.TIKTOK_API_BASE_URL
    }
};
