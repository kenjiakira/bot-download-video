#!/usr/bin/env bash
# Upload appstate.json lên JSONBin rồi gọi webhook bot (áp dụng + restart nếu đổi).
# Cần: curl, jq (tùy chọn)
#
# Usage:
#   export JSONBIN_BIN_ID=...
#   export JSONBIN_MASTER_KEY=...
#   export BOT_WEBHOOK_URL=https://your-app.onrender.com/api/webhook/appstate
#   export WEBHOOK_SECRET=...
#   ./scripts/push-appstate.sh [path/to/appstate.json]

set -euo pipefail

APPSTATE_FILE="${1:-appstate.json}"
BIN_ID="${JSONBIN_BIN_ID:-}"
MASTER_KEY="${JSONBIN_MASTER_KEY:-}"
WEBHOOK_URL="${BOT_WEBHOOK_URL:-}"
SECRET="${WEBHOOK_SECRET:-}"

if [[ ! -f "$APPSTATE_FILE" ]]; then
  echo "Không tìm thấy: $APPSTATE_FILE" >&2
  exit 1
fi

if [[ -z "$BIN_ID" || -z "$MASTER_KEY" ]]; then
  echo "Thiếu JSONBIN_BIN_ID hoặc JSONBIN_MASTER_KEY" >&2
  exit 1
fi

echo "→ Upload lên JSONBin ($BIN_ID)…"
HTTP_CODE=$(curl -sS -o /tmp/jsonbin-put.json -w "%{http_code}" \
  -X PUT "https://api.jsonbin.io/v3/b/${BIN_ID}" \
  -H "Content-Type: application/json" \
  -H "X-Master-Key: ${MASTER_KEY}" \
  --data-binary @"$APPSTATE_FILE")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "JSONBin PUT lỗi HTTP $HTTP_CODE" >&2
  cat /tmp/jsonbin-put.json >&2
  exit 1
fi
echo "✓ Đã upload JSONBin"

if [[ -z "$WEBHOOK_URL" || -z "$SECRET" ]]; then
  echo "⚠ Chưa set BOT_WEBHOOK_URL / WEBHOOK_SECRET — bỏ qua webhook."
  echo "  Mở dashboard → Điều khiển → Áp dụng appstate"
  exit 0
fi

echo "→ Gọi webhook bot…"
RESP=$(curl -sS -X POST "$WEBHOOK_URL" \
  -H "X-Webhook-Secret: ${SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "$RESP"
if command -v jq >/dev/null 2>&1; then
  OK=$(echo "$RESP" | jq -r '.ok // false')
  if [[ "$OK" != "true" ]]; then exit 1; fi
fi
echo "✓ Xong"
