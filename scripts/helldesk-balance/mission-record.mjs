// Measurements use the same payout and Rep delta as the player's results card.
export function missionRecord(m, approach, combatSec, minSanityPct) {
  if (!m.over || !m.result) throw new Error('mission has no results card');
  const record = {
    card: m.card, seed: m.seed, approach,
    finish: m.finish === 'done' ? (m.result.quiet ? 'quiet' : 'loud') : m.finish,
    seconds: m.seconds, maxTier: m.maxTier, detectedAt: m.detectedAt, noticedAt: m.noticedAt,
    repTotal: m.result.repTotal, repBase: m.result.base, repQuietBonus: m.result.bonus, repResolves: m.result.perResolve,
    repPerMin: m.seconds > 0 ? m.result.repTotal * 60 / m.seconds : 0,
    combatSec, minSanityPct,
    ...(m.noiseEvents !== undefined ? { noiseEvents: m.noiseEvents } : {}),
  };
  validateMissionRecord(record);
  return record;
}

// Reject missing or inconsistent measurements before they can enter an average.
export function validateMissionRecord(r) {
  const time = (t) => t === null || (Number.isFinite(t) && t >= 0 && t <= r.seconds);
  if (!r || !['stapler', 'vendor'].includes(r.card) || !['quiet', 'loud', 'auto'].includes(r.approach)
    || !['quiet', 'loud', 'aborted', 'burnout'].includes(r.finish)
    || !Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff
    || !Number.isInteger(r.maxTier) || r.maxTier < 0 || r.maxTier > 3
    || ![r.seconds, r.repTotal, r.repBase, r.repQuietBonus, r.repResolves, r.repPerMin, r.combatSec, r.minSanityPct].every(Number.isFinite)
    || r.seconds < 0 || r.combatSec < 0 || r.combatSec > r.seconds + 1e-6 || r.minSanityPct < 0 || r.minSanityPct > 100
    || r.repBase < 0 || r.repQuietBonus < 0 || r.repResolves < 0
    || !time(r.detectedAt) || !time(r.noticedAt)
    || (r.maxTier >= 2 ? r.detectedAt === null : r.detectedAt !== null)
    || (r.maxTier >= 1 ? r.noticedAt === null : r.noticedAt !== null)
    || (r.detectedAt !== null && r.noticedAt > r.detectedAt)
    || (r.finish === 'quiet' && r.maxTier >= 2)
    || (r.noiseEvents !== undefined && (!Number.isInteger(r.noiseEvents) || r.noiseEvents < 0))
    || Math.abs(r.repPerMin - (r.seconds > 0 ? r.repTotal * 60 / r.seconds : 0)) > 1e-6) {
    throw new Error('invalid mission record');
  }
}
