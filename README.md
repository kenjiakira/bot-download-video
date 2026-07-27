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
| `SESSION_CHECK_INTERVAL` | Phút giữa mỗi lần tự check session còn sống (mặc định 5) |
| `SESSION_FAIL_THRESHOLD` | Số lần fail liên tiếp trước khi báo DIE (mặc định 2) |
| `AUTO_RESTART_ENABLED` | Restart định kỳ 3h30 (`true`/`false`, mặc định tắt) |
| `PROXY_URL` | Proxy cố định (không random mỗi boot) |
| `FB_USER_AGENT` | User-Agent cố định |
| `LOGIN_DELAY_MS` | Delay trước login (mặc định 3000) |
| `SEND_DELAY_MS` | Khoảng cách tối thiểu giữa 2 lần gửi tin (2500) |
| `SEND_ATTACHMENT_EXTRA_MS` | Thêm delay khi gửi kèm file (2000) |
| `DOWNLOAD_CONCURRENCY` | Số download song song (1) |
| `DOWNLOAD_COOLDOWN_MS` | Cooldown cùng URL+thread (120000 = 2 phút) |
| `DOWNLOAD_MAX_PER_THREAD` | Max download / nhóm / cửa sổ thời gian (3) |
| `DOWNLOAD_MAX_LINKS_PER_MSG` | Max link xử lý mỗi tin (1) |
| `TIKTOK_API_BASE_URL` | TikTok API (default tikwm) |
| `ZM_API_BASE_URL` / `ZM_API_KEY` | Social autolink API |
| `CAPCUT_API_BASE_URL` | CapCut download API |
| `APPSTATE` | Fallback: appstate JSON string (nếu không dùng JSONBin) |

## Chống die (biện pháp mềm)

- **Fingerprint ổn định**: proxy không random; UA Chrome 131 cố định; tắt mark read/delivery/presence
- **Rate-limit gửi**: queue `sendMessage` + delay attachment
- **Rate-limit download**: 1 link/tin, cooldown URL, giới hạn theo nhóm, concurrency = 1
- **Ít media/lần**: Twitter/Weibo/XHS/Threads tối đa 2–3 file
- **Tắt auto-restart 3h30** (tránh login lại liên tục)
- **Session guard 5 phút** + báo admin + poll JSONBin khi die

## Session guard (biết die khi không ai check)

Sau login, bot tự gọi Facebook (`getUserInfo`) mỗi **5 phút**:

- OK → log `[session] OK` + cập nhật `GET /session`
- DIE (`Not logged in`, checkpoint, …) hoặc fail đủ ngưỡng →:
  1. Báo tất cả `adminUIDs` trên Messenger
  2. `botReady=false`, xem tại `GET /session` hoặc `GET /`
  3. Poll JSONBin lấy cookie mới → có thì restart login lại

```env
SESSION_CHECK_INTERVAL=5
SESSION_FAIL_THRESHOLD=2
```

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

HTTP keep-alive: `GET /`, `/health`, `/ping`, `/session` → UptimeRobot dùng `/ping`.


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
main.js                 # Express + login + listen
utils/webServer.js      # / /health /ping /session
utils/sessionGuard.js   # check session mỗi 5 phút
utils/fingerprint.js    # proxy/UA ổn định
utils/sendQueue.js      # rate-limit sendMessage
utils/downloadGuard.js  # cooldown + concurrency download
events/atd.js           # auto-download
render.yaml
```
