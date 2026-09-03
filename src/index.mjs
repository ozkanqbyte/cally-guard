/**
 * Cally AI Guard - reference engine.
 *
 * Three bounded contexts, all pure and dependency-free so they port cleanly into
 * a Firebase Cloud Function or a stand-alone voice-agent worker:
 *
 *   detection/   caller transcript  -> live scam score
 *   reputation/  community reports   -> number risk score
 *   guard/       score + turn count  -> safe AI reply + hang-up decision
 *
 * `api/` wires them behind a small HTTP surface for tests and local runs.
 */
export { DetectionSession, scoreTranscript, bandFor, lexiconFor } from './detection/detector.mjs';
export { SIGNALS, BENIGN_MARKERS, HOT_WORDS } from './detection/lexicon.mjs';
export { getLocale, allHotWords, LOCALES, DEFAULT_LOCALE } from './detection/locales/index.mjs';
export { LexiconOverlay } from './detection/overlay.mjs';
export { scoreNumber, ReportStore, CATEGORY_SEVERITY } from './reputation/reputation.mjs';
export { GuardCall } from './guard/session.mjs';
export { decide, isSafeLine } from './guard/policy.mjs';
export { pickHighlights, sanitizeLine } from './guard/highlights.mjs';
export { createGuardServer } from './api/server.mjs';
export { VoiceAgent } from './agent/voice-agent.mjs';
export { FakeStt, FakeTts, identityPolish } from './agent/adapters.mjs';
export { humanize, makeHumanize } from './agent/humanize.mjs';
export {
  makeLlmPolish, llmPolishFromEnv, makeLlmConverse, llmConverseFromEnv,
} from './agent/providers/llm-polish.mjs';
export { train, predict, SEED_MODEL, serialize, deserialize } from './ml/classifier.mjs';
export { CORPUS } from './ml/corpus.mjs';
export { runEnsemble } from './ensemble/ensemble.mjs';
export { rulesVote, mlVote, heuristicJudge, withFallback } from './ensemble/judge.mjs';
export {
  detectionScored, ensembleDecided, callEnded, userFeedback,
  FakeSink, summarizeMetrics,
} from './observability/events.mjs';
export { INTEGRATIONS } from './config.mjs';
export { LearningPipeline, InMemoryLearningStore, gradeModel } from './learning/pipeline.mjs';
export { GuardMetrics } from './observability/metrics.mjs';
