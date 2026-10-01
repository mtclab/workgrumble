function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function missionSummary(records) {
  const quiet = records.filter((r) => r.card === 'stapler' && r.approach === 'quiet');
  const groups = [];
  for (const card of ['stapler', 'vendor']) {
    for (const approach of ['quiet', 'loud']) {
      const runs = records.filter((r) => r.card === card && r.approach === approach);
      const rates = runs.map((r) => r.repPerMin);
      const mean = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
      groups.push({ card, approach, runs: runs.length, mean, spread: rates.length ? Math.max(...rates) - Math.min(...rates) : null });
    }
  }
  const quietMean = groups.find((g) => g.card === 'stapler' && g.approach === 'quiet').mean;
  const loudMean = groups.find((g) => g.card === 'stapler' && g.approach === 'loud').mean;
  const ratio = quietMean !== null && loudMean > 0 ? quietMean / loudMean : null;
  return {
    staplerQuiet: {
      runs: quiet.length,
      detectionRate: quiet.length ? quiet.filter((r) => r.finish !== 'quiet').length / quiet.length : null,
      medianDetectedAt: median(quiet.map((r) => r.detectedAt).filter((t) => t !== null)),
      quietFinishShare: quiet.length ? quiet.filter((r) => r.finish === 'quiet').length / quiet.length : null,
    },
    repPerMin: groups,
    staplerQuietVsLoudRatio: ratio,
    withinTarget: ratio === null ? null : ratio >= 0.85 && ratio <= 1.15,
  };
}
