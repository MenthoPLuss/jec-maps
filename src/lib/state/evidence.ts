import { POLICY } from "./policy";

/** Several fixes in a row that say the same thing. One fix alone never decides. */
export interface Evidence {
  count: number;
  firstAt: number;
  lastAt: number;
}

/** `at` is the time of the fix, not of its arrival. */
export function addEvidence(evidence: Evidence | null, at: number): Evidence {
  // After a long gap the earlier fixes are stale, and stale fixes don't count.
  if (!evidence || at - evidence.lastAt > POLICY.fix.staleAfterMs) return { count: 1, firstAt: at, lastAt: at };
  return { count: evidence.count + 1, firstAt: evidence.firstAt, lastAt: at };
}

export function isEnough(evidence: Evidence | null, rule: { fixes: number; minSpanMs: number }): boolean {
  return evidence !== null && evidence.count >= rule.fixes && evidence.lastAt - evidence.firstAt >= rule.minSpanMs;
}
