/**
 * Rolling metrics for the AI Guard — what the admin dashboard shows.
 *
 * Fed the same privacy-safe events as the event sink (signal ids + scores +
 * outcomes, never raw transcript). Keeps daily buckets and running totals so
 * `overview()` is O(days), not O(events).
 */

const DAY_MS = 86_400_000;

export class GuardMetrics {
  constructor({ retentionDays = 90 } = {}) {
    this._retentionDays = retentionDays;
    /** @type {Map<string, {calls:number, riskSum:number, actions:Record<string,number>}>} */
    this._days = new Map();
    /** @type {Record<string, number>} */
    this._signalCounts = {};
    /** @type {Record<string, number>} */
    this._bandCounts = { low: 0, elevated: 0, high: 0, severe: 0 };
    this._totalCalls = 0;
    this._riskSum = 0;
    // gold-label confusion from user feedback
    this._tp = 0; this._fp = 0; this._tn = 0; this._fn = 0;
  }

  _dayKey(at) {
    return new Date(at - (at % DAY_MS)).toISOString().slice(0, 10);
  }

  _bucket(at) {
    const key = this._dayKey(at);
    let b = this._days.get(key);
    if (!b) {
      b = { calls: 0, riskSum: 0, actions: {} };
      this._days.set(key, b);
      if (this._days.size > this._retentionDays) {
        const oldest = [...this._days.keys()].sort()[0];
        this._days.delete(oldest);
      }
    }
    return b;
  }

  /** One scored caller turn (from `detectionScored`). */
  recordTurn({ at, score, band, signals = [] }) {
    this._bandCounts[band] = (this._bandCounts[band] ?? 0) + 1;
    for (const s of signals) this._signalCounts[s] = (this._signalCounts[s] ?? 0) + 1;
  }

  /** One AI Guard call finished (from `callEnded` / `ensembleDecided`). */
  recordCall({ at, finalScore = 0, action = 'silent' }) {
    this._totalCalls += 1;
    this._riskSum += finalScore;
    const b = this._bucket(at);
    b.calls += 1;
    b.riskSum += finalScore;
    b.actions[action] = (b.actions[action] ?? 0) + 1;
  }

  /** The user later told us the truth (from `userFeedback`). */
  recordFeedback({ wasScam, actionTaken }) {
    const acted = actionTaken === 'auto_hangup' || actionTaken === 'warn_user';
    if (wasScam && acted) this._tp += 1;
    else if (!wasScam && acted) this._fp += 1;
    else if (!wasScam && !acted) this._tn += 1;
    else this._fn += 1;
  }

  /** Everything the dashboard needs, in one shot. */
  overview() {
    const days = [...this._days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, b]) => ({
        date,
        calls: b.calls,
        avgRisk: b.calls ? Math.round(b.riskSum / b.calls) : 0,
        autoHangups: b.actions.auto_hangup ?? 0,
        warns: b.actions.warn_user ?? 0,
        asks: b.actions.ask_user ?? 0,
      }));

    const labelled = this._tp + this._fp + this._tn + this._fn;
    const topSignals = Object.entries(this._signalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ id, count }));

    return {
      totals: {
        calls: this._totalCalls,
        avgRisk: this._totalCalls ? Math.round(this._riskSum / this._totalCalls) : 0,
        labelledCalls: labelled,
      },
      quality: {
        truePositives: this._tp,
        falsePositives: this._fp,
        trueNegatives: this._tn,
        falseNegatives: this._fn,
        precision: this._tp + this._fp ? Number((this._tp / (this._tp + this._fp)).toFixed(3)) : null,
        recall: this._tp + this._fn ? Number((this._tp / (this._tp + this._fn)).toFixed(3)) : null,
      },
      bandDistribution: { ...this._bandCounts },
      topSignals,
      daily: days,
    };
  }
}
