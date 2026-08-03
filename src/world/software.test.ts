import { describe, expect, it } from 'vitest';

import { SLACK_RATES } from './meters';
import {
  INSTALLED_TOY_SLACK_RATE,
  INSTALL_BEAT_MINUTES,
  INSTALL_BEAT_RECORDS,
  installAuditBeat,
  installAuditCount,
  longestInstalledMinutes,
  parseInstallLedger,
} from './software';

describe('the install audit ledger', () => {
  it('parses id@tick lines into records, oldest first', () => {
    expect(parseInstallLedger('arcade@40\nmedia@95')).toEqual([
      { id: 'arcade', at: 40 },
      { id: 'media', at: 95 },
    ]);
    expect(installAuditCount('arcade@40\nmedia@95')).toBe(2);
  });

  it('reads an absent or empty trail as nothing installed', () => {
    expect(parseInstallLedger(undefined)).toEqual([]);
    expect(parseInstallLedger('')).toEqual([]);
    expect(installAuditCount(undefined)).toBe(0);
  });

  it('skips a line with a stamp that is not a whole number', () => {
    // A hand-edited save cannot smuggle a fake minute onto the record.
    expect(parseInstallLedger('arcade@notaminute')).toEqual([]);
  });

  it('measures the longest-standing install, not the total', () => {
    // Two installs; the older one has been up 60 minutes, the newer 10. The
    // beat's "it has been on there for most of the afternoon" reads the max.
    expect(longestInstalledMinutes('arcade@40\nmedia@90', 100)).toBe(60);
    // A record stamped in the future contributes nothing rather than a negative.
    expect(longestInstalledMinutes('arcade@200', 100)).toBe(0);
  });
});

describe('the lead reads the audit', () => {
  it('arms on a single install under a locked-down policy', () => {
    // Teeth: INSTALL_BEAT_RECORDS is one, so the first logged install under a
    // locked-down shop is already the whole of the evidence. Raise the constant
    // and this goes green with the trap the design forbids - a free first one.
    expect(installAuditBeat('locked_down', INSTALL_BEAT_RECORDS, 0).armed)
      .toBe(true);
  });

  it('does NOT arm under a wild-west policy however much is installed', () => {
    expect(installAuditBeat('wild_west', 9, INSTALL_BEAT_MINUTES + 100).armed)
      .toBe(false);
  });

  it('arms on minutes-installed even below the record threshold', () => {
    // A single toy left up all afternoon: zero would be below the record
    // threshold if that were higher, but the minutes carry it on their own.
    expect(installAuditBeat('locked_down', 0, INSTALL_BEAT_MINUTES).armed)
      .toBe(true);
    expect(installAuditBeat('locked_down', 0, INSTALL_BEAT_MINUTES - 1).armed)
      .toBe(false);
  });
});

describe('the balance table', () => {
  it('makes an installed toy stronger relief than the Browser', () => {
    // The honest tradeoff of a locked-down shop: better relief at higher audit
    // risk. If this inverts, the store's whole point is gone.
    expect(INSTALLED_TOY_SLACK_RATE.stressRelief)
      .toBeGreaterThan(SLACK_RATES.browser?.stressRelief ?? 0);
    expect(INSTALLED_TOY_SLACK_RATE.suspicion)
      .toBeGreaterThan(SLACK_RATES.browser?.suspicion ?? 0);
  });
});
