// Measurements use the same payout and Rep delta as the player's results card.
export function missionRecord(m, approach, combatSec, minSanityPct) {
  if (!m.over || !m.result) throw new Error('mission has no results card');
  return {
    card: m.card, seed: m.seed, approach,
    finish: m.finish === 'done' ? (m.result.quiet ? 'quiet' : 'loud') : m.finish,
    seconds: m.seconds, maxTier: m.maxTier, detectedAt: m.detectedAt, noticedAt: m.noticedAt,
    repTotal: m.result.repTotal, repBase: m.result.base, repQuietBonus: m.result.bonus, repResolves: m.result.perResolve,
    repPerMin: m.seconds > 0 ? m.result.repTotal * 60 / m.seconds : 0,
    combatSec, minSanityPct,
    ...(m.noiseEvents !== undefined ? { noiseEvents: m.noiseEvents } : {}),
  };
}
