import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ReportStore } from '../reputation/reputation.mjs';
import { GuardCall } from '../guard/session.mjs';
import { LearningPipeline, InMemoryLearningStore } from '../learning/pipeline.mjs';
import { GuardMetrics } from '../observability/metrics.mjs';
import { LexiconOverlay } from '../detection/overlay.mjs';
import { lexiconFor, scoreTranscript } from '../detection/detector.mjs';

/**
 * Zero-dependency HTTP surface for the Guard engine. This is the reference
 * implementation the Cloud Function and the load test both run against.
 *
 *   POST /v1/reports                 {number, category, reporterTrust?}
 *   GET  /v1/score?number=...
 *   POST /v1/guard/calls             -> {callId, opening}
 *   POST /v1/guard/calls/:id/turns   {text} -> TurnResult
 *   GET  /v1/guard/calls/:id/summary
 *
 *   -- learning loop (admin panel) --
 *   POST /v1/learning/feedback       {text, userLabel, modelLabel}
 *   GET  /v1/learning/queue          -> pending review items
 *   POST /v1/learning/review/:id     {decision:'approve'|'reject', label?}
 *   POST /v1/learning/candidate      -> retrain + auto-grade a candidate
 *   GET  /v1/learning/candidates     -> candidates + grades
 *   POST /v1/learning/publish/:ver   -> ship a graded candidate
 *
 * State is in-memory and per-process.
 */
export function createGuardServer({ now = () => Date.now(), lexiconOverlay } = {}) {
  const reports = new ReportStore();
  /** @type {Map<string, GuardCall>} */
  const calls = new Map();
  const learning = new LearningPipeline(new InMemoryLearningStore(), { now });
  const metrics = new GuardMetrics();
  const overlay = lexiconOverlay instanceof LexiconOverlay
    ? lexiconOverlay
    : new LexiconOverlay(lexiconOverlay || {});
  /** @type {Set<string>} calls already counted, so a re-fetched summary is not double-counted */
  const counted = new Set();

  return createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };

    try {
      const url = new URL(req.url, 'http://localhost');
      const { pathname } = url;

      if (req.method === 'POST' && pathname === '/v1/reports') {
        const body = await readJson(req);
        if (!body.number || !body.category) {
          return send(400, { error: 'number and category are required' });
        }
        reports.add({
          number: String(body.number),
          category: String(body.category),
          reporterTrust: body.reporterTrust,
        });
        return send(201, { ok: true, score: reports.score(String(body.number)) });
      }

      if (req.method === 'GET' && pathname === '/v1/score') {
        const number = url.searchParams.get('number');
        if (!number) return send(400, { error: 'number query param is required' });
        return send(200, reports.score(number));
      }

      if (req.method === 'POST' && pathname === '/v1/guard/calls') {
        const id = randomUUID();
        const locale = url.searchParams.get('locale') || 'tr';
        const call = new GuardCall(id, { locale, overlay: overlay.get(locale) });
        calls.set(id, call);
        return send(201, { callId: id, opening: call.opening });
      }

      // ── lexicon editor (admin panel) ──────────────────────────────────────
      if (req.method === 'GET' && pathname === '/v1/lexicon') {
        const locale = url.searchParams.get('locale') || 'tr';
        const extra = overlay.get(locale);
        return send(200, {
          locale,
          signals: lexiconFor(locale).map((s) => ({
            ...s,
            base: s.base.map((g) => g.join(' + ')),
            extra: (extra[s.id] || []).map((g) => g.join(' + ')),
          })),
        });
      }

      if (req.method === 'POST' && pathname === '/v1/lexicon/phrase') {
        const b = await readJson(req);
        if (!b.locale || !b.signalId || !b.phrase) {
          return send(400, { error: 'locale, signalId and phrase are required' });
        }
        const ok = overlay.addPhrase(b.locale, b.signalId, b.phrase);
        return send(ok ? 201 : 409, { ok, snapshot: overlay.snapshot() });
      }

      if (req.method === 'DELETE' && pathname === '/v1/lexicon/phrase') {
        const b = await readJson(req);
        const ok = overlay.removePhrase(b.locale, b.signalId, b.phrase);
        return send(ok ? 200 : 404, { ok, snapshot: overlay.snapshot() });
      }

      if (req.method === 'POST' && pathname === '/v1/lexicon/test') {
        const b = await readJson(req);
        const locale = b.locale || 'tr';
        const turns = Array.isArray(b.turns) ? b.turns.map(String) : [];
        // test against the server overlay + any phrases the caller sent inline
        // (the admin panel passes its Firestore doc: { signalId: [phrase,…] })
        const merged = new LexiconOverlay(overlay.snapshot());
        for (const [sig, list] of Object.entries(b.overlay || {})) {
          for (const p of list) merged.addPhrase(locale, sig, p);
        }
        const r = scoreTranscript(turns, { locale, overlay: merged.get(locale) });
        return send(200, {
          score: r.score, band: r.band, confidence: r.confidence,
          reasons: r.reasons, recommendGuard: r.recommendGuard,
        });
      }

      const turns = pathname.match(/^\/v1\/guard\/calls\/([^/]+)\/turns$/);
      if (req.method === 'POST' && turns) {
        const call = calls.get(turns[1]);
        if (!call) return send(404, { error: 'call not found' });
        if (call.ended) return send(409, { error: 'call already ended' });
        const body = await readJson(req);
        if (!body.text) return send(400, { error: 'text is required' });
        const turn = call.callerSaid(String(body.text));
        metrics.recordTurn({
          at: now(), score: turn.risk, band: turn.band,
          signals: turn.reasons.map((r) => r.id),
        });
        return send(200, turn);
      }

      const summary = pathname.match(/^\/v1\/guard\/calls\/([^/]+)\/summary$/);
      if (req.method === 'GET' && summary) {
        const call = calls.get(summary[1]);
        if (!call) return send(404, { error: 'call not found' });
        const s = call.summary();
        // first summary fetch = the call is over from the user's side
        if (!counted.has(s.callId)) {
          counted.add(s.callId);
          metrics.recordCall({
            at: now(),
            finalScore: s.risk,
            action: s.band === 'severe' ? 'auto_hangup' : s.band === 'high' ? 'warn_user' : 'silent',
          });
        }
        return send(200, s);
      }

      // ── learning loop ──────────────────────────────────────────────────────
      if (req.method === 'POST' && pathname === '/v1/learning/feedback') {
        const b = await readJson(req);
        if (!b.text || !b.userLabel || !b.modelLabel) {
          return send(400, { error: 'text, userLabel and modelLabel are required' });
        }
        metrics.recordFeedback({
          wasScam: b.userLabel === 'scam',
          actionTaken: b.modelLabel === 'scam' ? 'warn_user' : 'silent',
        });
        return send(201, { id: learning.recordFeedback(b) });
      }

      if (req.method === 'GET' && pathname === '/v1/metrics/overview') {
        return send(200, metrics.overview());
      }

      if (req.method === 'GET' && pathname === '/v1/learning/queue') {
        return send(200, { pending: learning.pendingReview() });
      }

      const review = pathname.match(/^\/v1\/learning\/review\/([^/]+)$/);
      if (req.method === 'POST' && review) {
        const b = await readJson(req);
        if (!['approve', 'reject'].includes(b.decision)) {
          return send(400, { error: 'decision must be approve or reject' });
        }
        const ok = learning.review(review[1], b);
        return send(ok ? 200 : 404, { ok });
      }

      if (req.method === 'POST' && pathname === '/v1/learning/candidate') {
        const c = learning.buildCandidate();
        return send(201, { version: c.version, status: c.status, grade: c.grade, corpusSize: c.corpusSize });
      }

      if (req.method === 'GET' && pathname === '/v1/learning/candidates') {
        return send(200, { candidates: learning.candidates(), published: learning._s.publishedVersion });
      }

      const publish = pathname.match(/^\/v1\/learning\/publish\/([^/]+)$/);
      if (req.method === 'POST' && publish) {
        const r = learning.publish(publish[1]);
        return send(r.ok ? 200 : 409, r.ok ? { ok: true, version: r.version } : r);
      }

      send(404, { error: 'not found' });
    } catch (err) {
      send(500, { error: err instanceof Error ? err.message : String(err) });
    }
  });
}

/** @param {import('node:http').IncomingMessage} req */
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
