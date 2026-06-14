# Production testnet deploy (VPS, always-on)

Stand the Holdfast GM service up so it runs 24/7 on a VPS with HTTPS, auto-
restart, and a tick cadence — the public agent arena live on Base Sepolia.

> **Testnet only.** No real value, throwaway keys (CLAUDE.md legal note). This
> is the Phase-4 playtest deployment, NOT a mainnet/value launch — that's gated
> behind an external audit + legal review (see `docs/ROADMAP.md` Phase 6).

Env + treasury funding details live in **[PLAYTEST.md](PLAYTEST.md)**; this doc
is the always-on infrastructure around them. Deploy artifacts: `gm/deploy/`.

## 0. Provision

- A small VPS (1–2 vCPU, 1–2 GB RAM is plenty for ~10 players), Ubuntu 22.04+.
- A non-root user `holdfast` (`sudo adduser holdfast`). Run everything as it.
- A domain with an **A record** → the VPS IP (e.g. `api.holdfast.foundation`).

## 1. Dependencies

```bash
# Node 20 LTS+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
# Foundry (only for the one-time treasury funding via cast)
curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup
# Caddy (automatic-HTTPS reverse proxy)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

## 2. Clone + build

```bash
cd ~ && git clone https://github.com/holdfast-fdn/Holdfast.git
cd Holdfast/gm && npm install        # the GM service
```

## 3. Secrets + funding (out of repo)

```bash
mkdir -p ~/holdfast && chmod 700 ~/holdfast
cp ~/Holdfast/gm/deploy/gm.env.example ~/holdfast/gm.env   # full template
nano ~/holdfast/gm.env               # fill the <…> placeholders (PLAYTEST.md §1)
chmod 600 ~/holdfast/gm.env
```

Use a **dedicated RPC** (Alchemy/QuickNode/Ankr) in `RPC_URL` — the public
`sepolia.base.org` rate-limits and caps `eth_getLogs` to 2000 blocks. Then fund
the four role wallets with **Base Sepolia ETH** (owner, operator, provider,
treasury) and the **compute treasury with Flux** (PLAYTEST.md §2).

## 4. Install the systemd units

```bash
# adjust User= and the paths in the unit files if your user/clone differ
sudo cp ~/Holdfast/gm/deploy/holdfast-gm.service /etc/systemd/system/
sudo cp ~/Holdfast/gm/deploy/holdfast-tick.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now holdfast-gm          # the bot + agent API
sudo systemctl enable --now holdfast-tick.timer  # the tick cadence
```

- `holdfast-gm` runs `run-bot.sh` (which sources `~/holdfast/gm.env`),
  `Restart=always` with a crash-loop backstop.
- `holdfast-tick.timer` fires one tick on a schedule (daily by default; edit
  `OnCalendar` for a live session). It just `touch`es the trigger file the GM
  watches — decoupled and safe under overlap. Alternatively set
  `TICK_INTERVAL_MS` in `gm.env` and skip the timer.

## 5. HTTPS front door

```bash
sudo nano /etc/caddy/Caddyfile        # paste gm/deploy/Caddyfile, set your domain
sudo systemctl reload caddy
```

Caddy auto-provisions TLS. The agent API (`AGENT_API_PORT`, default 8799) is now
reachable at `https://api.holdfast.foundation`. Keep the port itself firewalled to
localhost — only Caddy faces the internet:

```bash
sudo ufw allow 22,80,443/tcp && sudo ufw enable   # do NOT open 8799
```

<details><summary>nginx instead of Caddy</summary>

```nginx
server {
  listen 443 ssl;
  server_name api.holdfast.foundation;
  ssl_certificate     /etc/letsencrypt/live/api.holdfast.foundation/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.holdfast.foundation/privkey.pem;
  client_max_body_size 64k;
  location / { proxy_pass http://127.0.0.1:8799; }
}
```
(Get the cert with `certbot --nginx -d api.holdfast.foundation`.)
</details>

## 6. Verify

```bash
systemctl status holdfast-gm --no-pager
journalctl -u holdfast-gm -n 50 --no-pager     # expect: agent API listening… / compute sink ON…
curl -s https://api.holdfast.foundation/health         # { ok, chainId:84532, nextTick, faucet }
systemctl list-timers holdfast-tick.timer
```

Fire a manual tick to confirm the full loop:
```bash
touch ~/holdfast/tick.trigger
journalctl -u holdfast-gm -f                     # watch: emission | sink … / sink realised
```

## 7. Operations

| Task | Command |
|---|---|
| Logs (live) | `journalctl -u holdfast-gm -f` |
| Restart | `sudo systemctl restart holdfast-gm` |
| Fire a tick now | `touch ~/holdfast/tick.trigger` |
| Change cadence | edit `OnCalendar` in the timer → `systemctl restart holdfast-tick.timer` |
| Update / redeploy | `cd ~/Holdfast && git pull && cd gm && npm install && sudo systemctl restart holdfast-gm` |
| Top up treasury | `cast send … enroll`/`withdraw` (PLAYTEST.md §2) |

**Monitoring:** `Restart=always` + journald covers crashes. For liveness, the
bundled `holdfast-health.timer` (deploy: `gm/deploy/health-check.sh` +
`holdfast-health.{service,timer}`, set `ALERT_CHAT_ID`) probes `/health` every
2 min and, on a sustained outage, restarts the service and DMs the operator —
catching the hung-but-alive case `Restart=always` misses (Hermes is flaky). An
external check (UptimeRobot/Healthchecks.io) on `GET /health` is a good second
layer. Watch the per-tick `emission | sink` log line; a `⚠ emission > sink`
warning means re-check balance in `sim/world_sim.py`.

## 8. Go-live checklist

- [ ] `~/holdfast/gm.env` complete (incl. `AGENT_API_PORT`, `OWNER_PK`,
      `TREASURY_PK`, `FLUX_ADDRESS`), `chmod 600`, dedicated `RPC_URL`.
- [ ] Four role wallets funded with Sepolia ETH; treasury funded with Flux.
- [ ] `holdfast-gm` active; `/health` returns 200 over HTTPS.
- [ ] Tick timer scheduled (or `TICK_INTERVAL_MS` set); one manual tick verified.
- [ ] Port 8799 firewalled to localhost; only 80/443/22 open.
- [ ] Companion map pointed at the dedicated RPC; friends handed
      `https://api.holdfast.foundation` + the SDK (PLAYTEST.md §4).
- [ ] npm token from setup rotated; no secrets in the repo.
