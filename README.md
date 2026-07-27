# Bot Download Video

Facebook Messenger bot that **auto-downloads** media when someone posts a link. No command prefix — paste a URL and the bot replies with the file.

## Supported platforms

- TikTok
- YouTube (max 15 minutes)
- Facebook
- Instagram
- Twitter / X
- CapCut
- Douyin
- Weibo
- Xiaohongshu
- Threads
- Pinterest

## Prerequisites

- Node.js 18+
- Facebook account + `appstate.json` (cookie session)
- Optional: proxies in `utils/prox.txt` (`host:port` per line)

## Setup

```bash
npm install
cp appstate.example.json appstate.json   # then paste your appstate
cp .env.example .env                     # fill API keys as needed
```

Edit `admin.json`:

- `FCA` — folder name under `logins/` (default: `hut-chat-api`)
- `botName`, `adminUIDs`, etc.

## Environment

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (Render sets this automatically) |
| `JSONBIN_BIN_ID` | Bin ID trên [JSONBin.io](https://jsonbin.io) |
| `JSONBIN_MASTER_KEY` | Master Key (private bin) |
| `APPSTATE_SYNC_*` | Bật/tắt sync, chu kỳ kiểm tra (mặc định 15 phút) |
| `TIKTOK_API_BASE_URL` | TikTok API (default tikwm) |
| `ZM_API_BASE_URL` / `ZM_API_KEY` | Social autolink API |
| `CAPCUT_API_BASE_URL` | CapCut download API |
| `APPSTATE` | Fallback: appstate JSON string (nếu không dùng JSONBin) |

## Appstate qua JSONBin.io

Bot đã có sẵn `utils/appstateSync.js` hỗ trợ [JSONBin.io](https://jsonbin.io):

1. Đăng ký / đăng nhập JSONBin.io
2. **Create Bin** → paste toàn bộ nội dung `appstate.json` (phải là **mảng JSON**)
3. Đặt bin **Private**, copy **Bin ID** và **Master Key**
4. Thêm vào `.env` hoặc Render Environment:

```env
JSONBIN_BIN_ID=674a1b2c3d4e5f6789012345
JSONBIN_MASTER_KEY=$2a$10$xxxxxxxx
APPSTATE_SYNC_ENABLED=true
```

Bot sẽ:
- Tải appstate từ JSONBin **trước khi login**
- Kiểm tra định kỳ; nếu bạn cập nhật bin → bot tự restart và dùng session mới

Cập nhật cookie: chỉ cần sửa bin trên JSONBin, không cần redeploy Render.

## Run

```bash
npm start
```

HTTP keep-alive: `GET /`, `/health`, `/ping` → dùng cho UptimeRobot.

Sends a supported link in any chat with the bot → media is downloaded and sent back.

## Deploy trên Render (treo 24/24)

1. Push repo lên GitHub, tạo **Web Service** trên [Render](https://render.com).
2. **Build:** `npm install` · **Start:** `npm start` · Runtime Node 18+.
3. Environment trên Render:
   - `JSONBIN_BIN_ID` + `JSONBIN_MASTER_KEY` (appstate từ JSONBin)
   - `ZM_API_*`, `TIKTOK_API_BASE_URL`, …
4. Sau khi deploy, copy URL dạng `https://<ten-app>.onrender.com`.
5. Vào [UptimeRobot](https://uptimerobot.com) → Add Monitor:
   - Monitor Type: **HTTP(s)**
   - URL: `https://<ten-app>.onrender.com/ping`
   - Interval: **5 minutes**
6. UptimeRobot ping mỗi 5 phút → Render free không sleep, bot online 24/24.

Có thể dùng `render.yaml` trong repo (Blueprint) để tạo service nhanh hơn.

## Layout

```
main.js              # Express keep-alive + login + listen
utils/webServer.js   # / /health /ping
events/atd.js        # auto-download handlers
utils/downloader.js
utils/listen.js
logins/<FCA>/        # Messenger login backends
render.yaml          # Render Blueprint
```
