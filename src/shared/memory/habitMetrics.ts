// @lat: [[lat.md/habit-formation#KPIs & Measurement]]
// Pure, dependency-free metrics for the habit-formation specialization.
// All functions are pure: pass data in, get numbers out. No Redis/Deno here.
//
// North Star Metric = Total Challenge Count (挑戦数): the cumulative number of
// times the user acted on a "want-to" despite fear or setback. Every tiny attempt
// (read one line, walk one minute) is +1. Retention / bounce-back are byproducts.

// Each calendar day is "active" if the user produced >=1 log entry that day.
export type DayActivity = { date: string; active: boolean };

// A single "challenge" = one logged attempt at a want-to action, however small.
export type ChallengeLog = {
  date: string;
  domain?: string; // which life domain (exercise/study/...), for diversity
  isNewExperiment?: boolean; // stepped into a new domain or new way
  // A challenge that "didn't land" (failed to stick) is still valued as data,
  // not a deficit — set this true when the attempt did not produce the hoped result.
  failed?: boolean;
};

// ★ North Star: cumulative count of challenges (spec §4.1).
export function computeTotalChallengeCount(challenges: ChallengeLog[]): number {
  return challenges.length;
}

// Sub-metric: share of challenges that were new experiments (spec §4.2).
// Returns 0..1. NaN-safe: 0 when there are no challenges.
export function computeNewExperimentRate(challenges: ChallengeLog[]): number {
  if (challenges.length === 0) return 0;
  const newOnes = challenges.filter((c) => c.isNewExperiment).length;
  return newOnes / challenges.length;
}

// Distinct life domains the user experimented in (for the album's diversity stat).
export function computeChallengeDomains(challenges: ChallengeLog[]): string[] {
  const set = new Set<string>();
  for (const c of challenges) {
    if (c.domain) set.add(c.domain);
  }
  return [...set];
}

// Count of challenges that didn't land but are valued as next-step data.
export function computeFailedChallengeCount(challenges: ChallengeLog[]): number {
  return challenges.filter((c) => c.failed).length;
}

// Bounce-Back Rate — byproduct metric (spec §4.4). Window = 3 days (adopted).
// A "slip" = a missed day preceded by >=1 active day (break in a streak).
// A "bounce-back" = an active day within `windowDays` after a slip day.
// Returns 0..1. NaN-safe: 0 when there are no slips.
export function computeBounceBackRate(
  activities: DayActivity[],
  windowDays = 3,
): number {
  if (activities.length === 0) return 0;

  let slips = 0;
  let bounceBacks = 0;

  for (let i = 0; i < activities.length; i++) {
    const day = activities[i];
    if (day.active) continue;

    // A slip requires a preceding active day (streak break).
    const hadPrecedingActive = activities
      .slice(0, i)
      .some((d) => d.active);
    if (!hadPrecedingActive) continue;

    slips++;
    // Look ahead within the window for any active day.
    const windowEnd = Math.min(i + windowDays, activities.length - 1);
    const recovered = activities
      .slice(i + 1, windowEnd + 1)
      .some((d) => d.active);
    if (recovered) bounceBacks++;
  }

  if (slips === 0) return 0;
  return bounceBacks / slips;
}

// Habit Automaticity proxy (0..100): behavior done with less willpower.
// Uses streak continuity — longest run of consecutive active days scaled to 100.
// NaN-safe: 0 when there are no active days.
export function computeHabitAutomaticity(activities: DayActivity[]): number {
  if (activities.length === 0) return 0;
  let longest = 0;
  let current = 0;
  for (const d of activities) {
    if (d.active) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  if (longest === 0) return 0;
  // Scale: a 66-day longest streak (Lally et al. mean automaticity) ~ full marks.
  return Math.min(100, Math.round((longest / 66) * 100));
}

// Resilience Index — count of *recovered* slips (a slip ending in a bounce-back
// is +1, not a failure). Mirrors computeBounceBackRate but returns the raw count.
export function computeResilienceIndex(
  activities: DayActivity[],
  windowDays = 3,
): number {
  if (activities.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < activities.length; i++) {
    const day = activities[i];
    if (day.active) continue;
    const hadPrecedingActive = activities.slice(0, i).some((d) => d.active);
    if (!hadPrecedingActive) continue;
    const windowEnd = Math.min(i + windowDays, activities.length - 1);
    const recovered = activities
      .slice(i + 1, windowEnd + 1)
      .some((d) => d.active);
    if (recovered) count++;
  }
  return count;
}

// Change-Talk Rate (0..1): share of days whose log carries a change-talk marker
// (user spontaneously said "I'll try / I'll do it"). Logs are raw strings;
// `marker` is the substring considered a change-talk signal.
export function computeChangeTalkRate(
  logs: string[],
  marker = "やってみる",
): number {
  if (logs.length === 0) return 0;
  const hits = logs.filter((l) => l.includes(marker)).length;
  return hits / logs.length;
}

// Assemble the 90-day user-facing "Challenge Collection Album" report (spec §4.3).
export function buildGrowthReport(input: {
  challenges: ChallengeLog[];
  activities: DayActivity[];
  logs: string[];
}): {
  totalChallengeCount: number;
  newExperimentRate: number;
  challengeDomains: string[];
  failedChallengeCount: number;
  bounceBackRate: number;
  habitAutomaticity: number;
  resilienceIndex: number;
  changeTalkRate: number;
} {
  return {
    totalChallengeCount: computeTotalChallengeCount(input.challenges),
    newExperimentRate: computeNewExperimentRate(input.challenges),
    challengeDomains: computeChallengeDomains(input.challenges),
    failedChallengeCount: computeFailedChallengeCount(input.challenges),
    bounceBackRate: computeBounceBackRate(input.activities),
    habitAutomaticity: computeHabitAutomaticity(input.activities),
    resilienceIndex: computeResilienceIndex(input.activities),
    changeTalkRate: computeChangeTalkRate(input.logs),
  };
}
