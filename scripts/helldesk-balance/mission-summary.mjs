function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Per card (every card in the records, the spike's two always first): the
// quiet runs' detection rate (finish not quiet / runs), median first Alert and
// quiet-finish share; Rep/min per approach; and the quiet/loud ratio against
// the 0.85-1.15 band (reported here, enforced in S6).
export function missionSummary(records) {
  const ids = [...new Set(['stapler', 'vendor', ...records.map((r) => r.card)])];
  const groups = [];
  const cards = [];
  for (const card of ids) {
    const rate = (approach) => {
      const runs = records.filter((r) => r.card === card && r.approach === approach);
      const rates = runs.map((r) => r.repPerMin);
      const mean = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
      return { card, approach, runs: runs.length, mean, spread: rates.length ? Math.max(...rates) - Math.min(...rates) : null };
    };
    const q = rate('quiet');
    const l = rate('loud');
    groups.push(q, l);
    const quiet = records.filter((r) => r.card === card && r.approach === 'quiet');
    const ratio = q.mean !== null && l.mean > 0 ? q.mean / l.mean : null;
    cards.push({
      card,
      quiet: {
        runs: quiet.length,
        detectionRate: quiet.length ? quiet.filter((r) => r.finish !== 'quiet').length / quiet.length : null,
        medianDetectedAt: median(quiet.map((r) => r.detectedAt).filter((t) => t !== null)),
        quietFinishShare: quiet.length ? quiet.filter((r) => r.finish === 'quiet').length / quiet.length : null,
      },
      quietVsLoudRatio: ratio,
      withinTarget: ratio === null ? null : ratio >= 0.85 && ratio <= 1.15,
    });
  }
  const stapler = cards[0];
  return {
    staplerQuiet: stapler.quiet,
    repPerMin: groups,
    staplerQuietVsLoudRatio: stapler.quietVsLoudRatio,
    withinTarget: stapler.withinTarget,
    cards,
  };
}

// Every card must be completable both ways: the share of each card x approach's
// runs that finished the card (quiet or loud). A failed card, a burnout or an
// abort counts against it. Below `least` (default 80%), the matrix fails.
export const COMPLETION_FLOOR = 0.8;

export function missionCompletion(records, least = COMPLETION_FLOOR) {
  const keys = [...new Set(records.map((r) => `${r.card}|${r.approach}`))];
  const groups = keys.map((key) => {
    const [card, approach] = key.split('|');
    const runs = records.filter((r) => r.card === card && r.approach === approach);
    const done = runs.filter((r) => r.finish === 'quiet' || r.finish === 'loud').length;
    const rate = done / runs.length;
    return { card, approach, runs: runs.length, done, rate, ok: rate >= least - 1e-9 };
  });
  return { least, groups, ok: groups.every((g) => g.ok) };
}
