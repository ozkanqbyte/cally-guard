/**
 * guard_reports  ─▶  learning review queue
 *
 * The phone app writes one anonymised record to Firestore `guard_reports` every
 * time Cally decides a call was a scam, and every time the user corrects that
 * ("bu bir dolandırıcı değildi"). This job is the wire from that pile into the
 * human-in-the-loop learning pipeline:
 *
 *   1. read a batch of un-queued guard_reports
 *   2. rebuild a caller-only transcript from the record
 *   3. re-score it with the engine (rules + ML ensemble stand-in: rules here)
 *   4. if the USER's verdict disagrees with what the engine would say, POST it
 *      to  /v1/learning/feedback  — it lands in the review queue, an admin
 *      approves or rejects it in GuardLearning.tsx, and only then does it join
 *      the training corpus. Nothing trains automatically.
 *   5. stamp the doc `queuedAt` so it is never processed twice
 *
 * Run it on a schedule next to the guard server:
 *
 *   GUARD_API_URL=http://localhost:8080 \
 *   FCM_SERVICE_ACCOUNT_JSON=/run/secrets/fcm.json \
 *   node jobs/ingest-reports.mjs
 *
 * (a cron entry / `docker compose` sidecar — every 10-15 min is plenty.)
 */
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { scoreTranscript } from '../src/detection/detector.mjs';

const API = (process.env.GUARD_API_URL || 'http://localhost:8080').replace(/\/$/, '');
const BATCH = Number(process.env.INGEST_BATCH || 100);
const MIN_SIGNAL_SCORE = Number(process.env.INGEST_MIN_SCORE || 20); // ignore near-empty records

function initFirebase() {
  if (admin.apps.length) return;
  const path = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!path) throw new Error('FCM_SERVICE_ACCOUNT_JSON not set — need a Firebase service account');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(path, 'utf8'))) });
}

/** Caller-only text from a stored record (already privacy-scrubbed on the phone). */
export function callerTextOf(report) {
  const lines = Array.isArray(report?.transcript) ? report.transcript : [];
  return lines.filter((l) => l && l.c !== false).map((l) => String(l.t || '')).filter(Boolean);
}

/** 'scam' | 'legit' — how the current engine would label this transcript. */
export function engineLabel(callerTurns, locale) {
  if (!callerTurns.length) return null;
  const v = scoreTranscript(callerTurns, { locale: locale || 'tr' });
  return v.score >= 50 ? 'scam' : 'legit';
}

async function postFeedback(text, userLabel, modelLabel) {
  const res = await fetch(`${API}/v1/learning/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, userLabel, modelLabel }),
  });
  if (!res.ok) throw new Error(`feedback ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function run({ now = () => new Date() } = {}) {
  initFirebase();
  const db = admin.firestore();

  const snap = await db
    .collection('guard_reports')
    .where('queuedAt', '==', null)
    .limit(BATCH)
    .get()
    .catch(async () => {
      // no composite index / field absent — fall back to a plain recent scan
      return db.collection('guard_reports').orderBy('serverAt', 'desc').limit(BATCH).get();
    });

  let seen = 0, queued = 0, skipped = 0;
  for (const doc of snap.docs) {
    const r = doc.data();
    if (r.queuedAt) { skipped += 1; continue; }
    seen += 1;

    const userLabel = r.verdict === 'not_scam' ? 'legit' : r.verdict === 'scam' ? 'scam' : null;
    const callerTurns = callerTextOf(r);
    const text = callerTurns.join(' ').trim();

    let didQueue = false;
    if (userLabel && text.length >= 12) {
      const modelLabel = engineLabel(callerTurns, r.locale)
        ?? ((r.score ?? 0) >= 50 ? 'scam' : 'legit');
      // only the disagreements are worth an admin's time — that is where the
      // model is wrong and a new example actually teaches it something:
      //   user 'scam'  + model 'legit'  → a miss we should learn to catch
      //   user 'legit' + model 'scam'   → a false alarm we should learn to drop
      const disagree = modelLabel !== userLabel;
      if (disagree && (r.score ?? 0) >= MIN_SIGNAL_SCORE) {
        try {
          await postFeedback(text, userLabel, modelLabel);
          queued += 1;
          didQueue = true;
        } catch (e) {
          console.warn(`[ingest] feedback failed for ${doc.id}: ${e.message}`);
        }
      }
    }

    await doc.ref.set(
      { queuedAt: now().toISOString(), queued: didQueue },
      { merge: true },
    ).catch(() => {});
  }

  console.log(`[ingest] scanned ${seen}, queued ${queued} for review, skipped ${skipped}`);
  return { seen, queued, skipped };
}

// run once when invoked directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('ingest-reports.mjs')) {
  run().then((r) => process.exit(r.seen >= 0 ? 0 : 1)).catch((e) => {
    console.error(`[ingest] ${e.message}`);
    process.exit(1);
  });
}
