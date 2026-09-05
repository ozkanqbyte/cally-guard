/**
 * Cally AI Guard — cheap external health check.
 *
 * Runs on the HOST (not in a container) every 5 minutes via cron. Checks
 * that every expected container is actually "Up", writes one small status
 * doc to Firestore, and the admin panel's Status page reads it — same
 * pattern as the existing Firebase/Firestore/user checks already there.
 *
 * Deliberately not a full monitoring stack (no Prometheus, no alerting
 * pipeline) — this is a tripwire, not observability. If it says "down",
 * someone still has to go SSH in and look at `docker logs`.
 */
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SERVICE_ACCOUNT_PATH = '/root/guard/deploy/firebase-service-account.json';
const EXPECTED_CONTAINERS = [
  'deploy-livekit-1',
  'deploy-livekit-sip-1',
  'deploy-whisper-1',
  'deploy-piper-1',
  'deploy-worker-1',
];

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))),
});

function runningContainers() {
  try {
    const out = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });
    return new Set(out.split('\n').map((s) => s.trim()).filter(Boolean));
  } catch (e) {
    console.error('docker ps failed:', e.message);
    return new Set();
  }
}

async function main() {
  const running = runningContainers();
  const downServices = EXPECTED_CONTAINERS.filter((c) => !running.has(c));
  const healthy = downServices.length === 0;

  await admin.firestore().collection('system_status').doc('guard').set({
    healthy,
    downServices,
    checkedAt: Date.now(),
    checkedAtIso: new Date().toISOString(),
  });

  console.log(healthy ? 'OK — all containers up' : `DOWN: ${downServices.join(', ')}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('healthcheck failed:', e.message);
  process.exit(1);
});
