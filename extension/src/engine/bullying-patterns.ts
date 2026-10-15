/**
 * Shield 2 - Pattern Detector.
 *
 *   S_sender ← λ^Δt · S_sender + s_new        λ = 0.8 per day, Δt in days
 *   alert when S_sender > θ (θ = 2.0)
 *
 * s_new is the message toxicity (0..1), so a single message can never raise
 * an alert on its own: bullying is repeated targeting.
 * Escalation: OLS slope of severity against time (days) over the most recent
 * events; a positive slope above `escalationSlope` means it is getting worse.
 */
import { PATTERN } from '../shared/constants';
import type { HarmCategory, PatternAssessment, SenderEvent, SenderPattern } from '../shared/types';
import { linearRegression, sha256Hex } from './math';

const DAY = 86_400_000;

export function decay(score: number, fromTs: number, toTs: number, lambda: number = PATTERN.lambda): number {
  const dtDays = Math.max(0, (toTs - fromTs) / DAY);
  return score * Math.pow(lambda, dtDays);
}

/** Locally-salted SHA-256 so the stored key is not the raw name/number. */
export async function senderKey(platform: string, label: string, salt: string): Promise<string> {
  return (await sha256Hex(`${salt}|${platform}|${label.trim().toLowerCase()}`)).slice(0, 32);
}

export interface NewEvent {
  ts: number;
  severity: number;
  category: HarmCategory | null;
  msgHash: string;
}

/** Returns a NEW pattern object (does not mutate); duplicates are ignored. */
export function addEvent(prev: SenderPattern | null, key: string, label: string, platform: string, ev: NewEvent): { pattern: SenderPattern; added: boolean } {
  const base: SenderPattern = prev
    ? { ...prev, events: [...prev.events] }
    : { senderKey: key, label, platform, score: 0, lastTs: ev.ts, events: [] };
  if (ev.severity < PATTERN.minSeverity || base.events.some((e) => e.msgHash === ev.msgHash)) {
    return { pattern: base, added: false };
  }
  const t = Math.max(ev.ts, base.lastTs); // never decay backwards
  base.score = decay(base.score, base.lastTs, t) + Math.max(0, Math.min(1, ev.severity));
  base.lastTs = t;
  const cutoff = ev.ts - PATTERN.retentionDays * DAY;
  base.events = [...base.events, { ts: ev.ts, severity: ev.severity, category: ev.category, msgHash: ev.msgHash } as SenderEvent]
    .filter((e) => e.ts >= cutoff)
    .sort((a, b) => a.ts - b.ts);
  return { pattern: base, added: true };
}

export function escalationSlope(events: SenderEvent[], maxEvents = 10): number | null {
  const recent = events.slice(-maxEvents);
  if (recent.length < PATTERN.minEventsForSlope) return null;
  const t0 = recent[0].ts;
  const fit = linearRegression(recent.map((e) => (e.ts - t0) / DAY), recent.map((e) => e.severity));
  return fit ? fit.slope : null;
}

export function assessPattern(p: SenderPattern | null, now: number = Date.now(), theta: number = PATTERN.theta): PatternAssessment {
  if (!p || p.events.length === 0) {
    return { score: 0, threshold: theta, alert: false, eventCount: 0, slopePerDay: null, escalating: false, explanation: 'No hurtful messages recorded from this sender.' };
  }
  const score = decay(p.score, p.lastTs, now);
  const slope = escalationSlope(p.events);
  const escalating = slope !== null && slope > PATTERN.escalationSlope;
  const alert = score > theta;
  const n = p.events.length;
  const span = Math.max(1, Math.round((p.events[n - 1].ts - p.events[0].ts) / DAY));
  let explanation: string;
  if (alert) explanation = `Repeated targeting: ${n} hurtful messages over ${span} day(s). Current score ${score.toFixed(2)} is above the alert level ${theta}.`;
  else if (n === 1) explanation = 'One hurtful message recorded. A single message is not treated as bullying.';
  else explanation = `${n} hurtful messages recorded; current score ${score.toFixed(2)} (alert above ${theta}). Older messages fade by ${Math.round((1 - PATTERN.lambda) * 100)}% per day.`;
  if (escalating) explanation += ` Severity is rising (+${slope!.toFixed(3)} per day).`;
  return { score, threshold: theta, alert, eventCount: n, slopePerDay: slope, escalating, explanation };
}
