#!/usr/bin/env bash
#
# Cally AI Guard — one-shot server setup.
#
# Run as root on a fresh Ubuntu/Debian VPS, after the guard folder is on it:
#
#     bash /root/guard/deploy/setup.sh
#
# It does, in order:
#   1. system update + base packages
#   2. Node.js 20
#   3. the full engine test suite   (proves the scam-detection code works here)
#   4. a live demo call             (visible proof)
#   5. Docker
#   6. LiveKit keys + firewall
#   7. brings up Whisper (STT) + Piper (TTS) + LiveKit and health-checks them
#
# It does NOT connect a phone line (needs a SIP trunk / GSM gateway — DEPLOY.md
# section 4) and does NOT wire Firebase push (drop fcm.json in, set the path in
# .env, then `docker compose up -d worker`).
#
set -euo pipefail

GUARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$GUARD_DIR/deploy"
log() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root:  sudo bash $0" >&2
  exit 1
fi

# ── 1. system ────────────────────────────────────────────────────────────────
log "1/7  System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ca-certificates ufw jq

# ── 2. Node ──────────────────────────────────────────────────────────────────
log "2/7  Node.js 20"
NODE_MAJOR=0
command -v node >/dev/null && NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "node $(node -v)"

# ── 3. tests ─────────────────────────────────────────────────────────────────
log "3/7  Engine test suite — must be green"
cd "$GUARD_DIR"
node --test

# ── 4. demo ──────────────────────────────────────────────────────────────────
log "4/7  Live demo — a scam call through the real engine"
node demo.mjs slowBank || true

# ── 5. Docker ────────────────────────────────────────────────────────────────
log "5/7  Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
# start the daemon (systemd VMs, plain-init WSL, or already-running Docker Desktop)
systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true
sleep 2
if ! docker info >/dev/null 2>&1; then
  echo "!! Docker is installed but the daemon is not reachable."
  echo "   WSL without systemd:  run  sudo service docker start   then re-run this script."
  echo "   Or install Docker Desktop for Windows and enable WSL integration."
  exit 1
fi
echo "$(docker --version)"

# ── 6. config ────────────────────────────────────────────────────────────────
log "6/7  LiveKit keys + firewall"
cd "$DEPLOY_DIR"
if [ ! -f .env ]; then
  cp env.sample .env
  SECRET="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)"
  sed -i "s|^LIVEKIT_API_KEY=.*|LIVEKIT_API_KEY=devkey|"                .env
  sed -i "s|^LIVEKIT_API_SECRET=.*|LIVEKIT_API_SECRET=${SECRET}|"       .env
  sed -i "s|change-me-to-a-long-random-string|${SECRET}|"              livekit.yaml
  PUB_IP="$(curl -fsS https://api.ipify.org || true)"
  [ -n "$PUB_IP" ] && sed -i "s|^PUBLIC_IP=.*|PUBLIC_IP=${PUB_IP}|"     .env
  echo "wrote .env  (LiveKit secret generated, public IP ${PUB_IP:-unknown})"
else
  echo ".env already exists — leaving it alone"
fi

# firewall — real VPS only; harmless no-op inside WSL
if ! grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
  ufw allow 22/tcp          >/dev/null 2>&1 || true
  ufw allow 7880/tcp        >/dev/null 2>&1 || true   # LiveKit signalling
  ufw allow 7881/tcp        >/dev/null 2>&1 || true   # LiveKit TCP media fallback
  ufw allow 5060/udp        >/dev/null 2>&1 || true   # SIP
  ufw allow 10000:20000/udp >/dev/null 2>&1 || true   # SIP RTP
  ufw allow 50000:60000/udp >/dev/null 2>&1 || true   # LiveKit RTC media
  yes | ufw enable          >/dev/null 2>&1 || true
  echo "firewall: SSH + LiveKit + SIP + media ports open"
else
  echo "WSL detected — skipping firewall (not reachable from outside anyway)"
fi

# ── 7. voice stack ───────────────────────────────────────────────────────────
log "7/7  Whisper + Piper + LiveKit"
docker compose up -d whisper piper livekit livekit-sip

echo "waiting for Whisper to download its Turkish model (~1-2 min first run)…"
for _ in $(seq 1 72); do
  if curl -fsS localhost:8000/health >/dev/null 2>&1 || curl -fsS localhost:8000/v1/models >/dev/null 2>&1; then
    break
  fi
  sleep 5
done

log "Health check"
curl -fsS localhost:8000/health >/dev/null 2>&1 && echo "  whisper  OK" || \
  { curl -fsS localhost:8000/v1/models >/dev/null 2>&1 && echo "  whisper  OK" || echo "  whisper  NOT ready (docker compose logs whisper)"; }
curl -fsS localhost:5000 >/dev/null 2>&1 && echo "  piper    OK" || echo "  piper    NOT ready (docker compose logs piper)"
curl -fsS localhost:7880 >/dev/null 2>&1 && echo "  livekit  OK" || echo "  livekit  NOT ready (docker compose logs livekit)"

cat <<EOF

────────────────────────────────────────────────────────────────
 SETUP DONE.

 Working now on this box:
   • scam-detection engine ....... all tests green (step 3 above)
   • Whisper STT + Piper TTS ...... running in Docker
   • LiveKit + LiveKit-SIP ........ running, ports open

 Still needed for an end-to-end phone call:
   1. a phone line — point a SIP trunk or GSM gateway at
        sip:${PUB_IP:-<this-server-ip>}:5060
      (see deploy/DEPLOY.md section 4)
   2. Firebase push — put the service-account file at
        ${DEPLOY_DIR}/fcm.json
      set  FCM_SERVICE_ACCOUNT_JSON=${DEPLOY_DIR}/fcm.json  in .env
   3. then:  docker compose up -d worker

 Logs:     docker compose logs -f
 Restart:  docker compose restart
────────────────────────────────────────────────────────────────
EOF
