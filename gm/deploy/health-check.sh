#!/usr/bin/env bash
# Holdfast GM liveness monitor. Probes the local /health endpoint; on a
# sustained outage it restarts the service and DMs the operator via the bot.
# Alerts ONLY on a state change (up<->down) so it never spams. Driven by
# holdfast-health.timer. Hermes/bot hangs are a known risk (CLAUDE.md), and
# systemd's Restart=always misses a hung-but-alive process — this catches it.
set -uo pipefail

ENV_FILE="${ENV_FILE:-$HOME/holdfast/gm.env}"
STATE="$(dirname "$ENV_FILE")/health.state"
URL="${HEALTH_URL:-http://127.0.0.1:8799/health}"
SERVICE="${HEALTH_SERVICE:-holdfast-gm}"
FAIL_THRESHOLD="${HEALTH_FAILS:-2}"   # consecutive fails before declaring DOWN

get(){ grep "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }
TOKEN="$(get TELEGRAM_BOT_TOKEN)"
# alerts go to the OPERATOR's DM, never the public war channel
CHAT="$(get ALERT_CHAT_ID)"

notify(){
  [ -n "$TOKEN" ] && [ -n "$CHAT" ] || return 0
  curl -s --max-time 10 "https://api.telegram.org/bot$TOKEN/sendMessage" \
    --data-urlencode "chat_id=$CHAT" --data-urlencode "text=$1" >/dev/null || true
}

# probe
ok=0
body="$(curl -s --max-time 10 "$URL" 2>/dev/null || true)"
case "$body" in *'"ok":true'*) ok=1;; esac

# prior state: "status fails"
status=up; fails=0
[ -f "$STATE" ] && read -r status fails < "$STATE" || true
[ -z "${status:-}" ] && status=up
[ -z "${fails:-}" ] && fails=0

ts="$(date -u '+%Y-%m-%d %H:%M UTC')"
event=""
if [ "$ok" = 1 ]; then
  [ "$status" = down ] && event=recovered
  status=up; fails=0
else
  fails=$((fails+1))
  if [ "$fails" -ge "$FAIL_THRESHOLD" ] && [ "$status" != down ]; then status=down; event=down; fi
fi
echo "$status $fails" > "$STATE"

if [ -n "${DRY_RUN:-}" ]; then
  echo "probe ok=$ok -> status=$status fails=$fails event=${event:-none} (chat=${CHAT:-unset})"; exit 0
fi

case "$event" in
  down)
    systemctl restart "$SERVICE" 2>/dev/null || true
    notify "🔴 Holdfast GM DOWN ($ts) — /health unresponsive on :8799. Auto-restart attempted. (host $(hostname))"
    ;;
  recovered)
    notify "🟢 Holdfast GM recovered ($ts). (host $(hostname))"
    ;;
esac
