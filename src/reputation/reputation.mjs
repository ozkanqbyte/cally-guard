/**
 * Community-report scoring for a phone number - the cheap first line that runs
 * on every incoming call before anything else.
 *
 * The score saturates (many reports plateau rather than run away), decays with
 * age (a number "goes quiet" over ~3 months), and weights each report by how
 * much the reporter is trusted and how serious the category is.
 *
 * @typedef {Object} Report
 * @property {string} number         E.164, normalised upstream
 * @property {string} category       key of CATEGORY_SEVERITY
 * @property {number} [reporterTrust] 0..1, default 0.3
 * @property {number} [at]            epoch ms, default now
 *
 * @typedef {'safe'|'unknown'|'low'|'elevated'|'high'} RepBand
 * @typedef {Object} ReputationResult
 * @property {number} score          0..100
 * @property {RepBand} band
 * @property {number} reportCount
 * @property {string[]} topCategories
 */

export const CATEGORY_SEVERITY = {
  scam: 1.0,
  phishing: 1.0,
  fraud: 1.0,
  robocall: 0.5,
  nuisance: 0.4,
  telemarketing: 0.4,
  survey: 0.3,
  silent: 0.3,
};

const HALF_LIFE_DAYS = 90;
const SATURATION_K = 2.0;
const DAY_MS = 86_400_000;

/** @param {number} ageMs @returns {number} 1 when fresh, -> 0 as it ages */
function decay(ageMs) {
  return 0.5 ** (Math.max(0, ageMs) / (HALF_LIFE_DAYS * DAY_MS));
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** @param {number} score @returns {RepBand} */
function bandFor(score) {
  if (score >= 60) return 'high';
  if (score >= 25) return 'elevated';
  if (score > 0) return 'low';
  return 'unknown';
}

/**
 * @param {Object} params
 * @param {Report[]} [params.reports]
 * @param {number} [params.now]
 * @param {boolean} [params.safeListed]
 * @returns {ReputationResult}
 */
export function scoreNumber({ reports = [], now = Date.now(), safeListed = false } = {}) {
  if (safeListed) {
    return { score: 0, band: 'safe', reportCount: reports.length, topCategories: [] };
  }
  if (reports.length === 0) {
    return { score: 0, band: 'unknown', reportCount: 0, topCategories: [] };
  }

  let weight = 0;
  /** @type {Map<string, number>} */
  const byCategory = new Map();
  for (const r of reports) {
    const severity = CATEGORY_SEVERITY[r.category] ?? 0.4;
    const trust = clamp01(r.reporterTrust ?? 0.3);
    const w = trust * severity * decay(now - (r.at ?? now));
    weight += w;
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + w);
  }

  const score = Math.round(100 * (1 - Math.exp(-weight / SATURATION_K)));
  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  return { score, band: bandFor(score), reportCount: reports.length, topCategories };
}

/**
 * In-memory report store. Production swaps this for Firestore; the surface is
 * kept tiny so the swap is mechanical.
 */
export class ReportStore {
  constructor() {
    /** @type {Map<string, Report[]>} */
    this._byNumber = new Map();
  }

  /** @param {Report} report */
  add(report) {
    const list = this._byNumber.get(report.number) ?? [];
    list.push({ ...report, at: report.at ?? Date.now() });
    this._byNumber.set(report.number, list);
  }

  /** @param {string} number @returns {Report[]} */
  reportsFor(number) {
    return this._byNumber.get(number) ?? [];
  }

  /**
   * @param {string} number
   * @param {{now?:number, safeListed?:boolean}} [opts]
   * @returns {ReputationResult}
   */
  score(number, opts = {}) {
    return scoreNumber({ reports: this.reportsFor(number), ...opts });
  }
}
