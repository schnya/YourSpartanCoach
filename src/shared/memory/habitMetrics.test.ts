// @lat: [[lat.md/habit-formation#KPIs & Measurement]]
import assert from "node:assert";
import {
	buildGrowthReport,
	type ChallengeLog,
	computeBounceBackRate,
	computeChallengeDomains,
	computeChangeTalkRate,
	computeFailedChallengeCount,
	computeHabitAutomaticity,
	computeNewExperimentRate,
	computeResilienceIndex,
	computeTotalChallengeCount,
	type DayActivity,
} from "./habitMetrics.js";

declare const Deno: {
	test: (name: string, fn: () => void | Promise<void>) => void;
};

const noChallenges: ChallengeLog[] = [];
const challenges: ChallengeLog[] = [
	{ date: "2026-01-01", domain: "exercise", isNewExperiment: true },
	{ date: "2026-01-02", domain: "exercise" },
	{ date: "2026-01-03", domain: "study", isNewExperiment: true, failed: true },
	{ date: "2026-01-04", domain: "study" },
];

Deno.test("computeTotalChallengeCount: counts every attempt", () => {
	assert.strictEqual(computeTotalChallengeCount(noChallenges), 0);
	assert.strictEqual(computeTotalChallengeCount(challenges), 4);
});

Deno.test("computeNewExperimentRate: share of new experiments, NaN-safe", () => {
	assert.strictEqual(computeNewExperimentRate(noChallenges), 0);
	// 2 of 4 are new experiments
	assert.strictEqual(computeNewExperimentRate(challenges), 0.5);
});

Deno.test("computeChallengeDomains: distinct domains only", () => {
	assert.deepStrictEqual(computeChallengeDomains(challenges).sort(), [
		"exercise",
		"study",
	]);
	assert.deepStrictEqual(computeChallengeDomains(noChallenges), []);
});

Deno.test("computeFailedChallengeCount: counts failed but valued attempts", () => {
	assert.strictEqual(computeFailedChallengeCount(challenges), 1);
	assert.strictEqual(computeFailedChallengeCount(noChallenges), 0);
});

// Helper: build a 10-day activity array from an "A" (active) / "M" (missed) string.
function acts(pattern: string): DayActivity[] {
	return pattern.split("").map((c, i) => ({
		date: `2026-01-${String(i + 1).padStart(2, "0")}`,
		active: c === "A",
	}));
}

Deno.test("computeBounceBackRate: 0 when no slips", () => {
	assert.strictEqual(computeBounceBackRate(acts("AAAAAAAAAA")), 0);
	assert.strictEqual(computeBounceBackRate(acts("MMMMMMMMMM")), 0);
});

Deno.test("computeBounceBackRate: 1 when every slip recovers within 3 days", () => {
	// active, miss, active (recovered within window), ending on an active day
	assert.strictEqual(computeBounceBackRate(acts("AMAMAMAMAA")), 1);
});

Deno.test("computeBounceBackRate: 0 when no recovery occurs", () => {
	// active, then permanent miss (no active day after)
	assert.strictEqual(computeBounceBackRate(acts("AMMMMMMMMM")), 0);
});

Deno.test("computeBounceBackRate: 3-day window catches weekend recovery", () => {
	// skip Fri, weekend (Sat/Sun), resume Mon -> recovered within 3 days.
	// Thu(A) Fri(M) Sat(M) Sun(M) Mon(A) Tue(A) = "AAAAMMMAA" (9 days, M x3)
	assert.strictEqual(computeBounceBackRate(acts("AAAAMMMAA")), 1);
});

Deno.test("computeBounceBackRate: default window is 3 days", () => {
	// A slip at idx1, recovery at idx4 (3 days later, within window=3 from idx1)
	assert.strictEqual(
		computeBounceBackRate(acts("AMMM A".replace(" ", "")), 3),
		1,
	);
});

Deno.test("computeResilienceIndex: +1 per recovered slip", () => {
	assert.strictEqual(computeResilienceIndex(acts("AMAMAMAMAM")), 4);
	assert.strictEqual(computeResilienceIndex(acts("AMMMMMMMMM")), 0);
});

Deno.test("computeHabitAutomaticity: longest streak scaled, NaN-safe", () => {
	assert.strictEqual(computeHabitAutomaticity(acts("MMMMMMMMMM")), 0);
	// 66-day longest streak ~ 100
	assert.strictEqual(computeHabitAutomaticity(acts("A".repeat(66))), 100);
	// 33-day longest streak ~ 50
	assert.strictEqual(computeHabitAutomaticity(acts("A".repeat(33))), 50);
});

Deno.test("computeChangeTalkRate: share of days with marker, NaN-safe", () => {
	assert.strictEqual(computeChangeTalkRate([]), 0);
	const logs = ["今日はやってみる", "疲れた", "明日もやってみる"];
	assert.strictEqual(computeChangeTalkRate(logs), 2 / 3);
});

Deno.test("buildGrowthReport: assembles the album shape", () => {
	const report = buildGrowthReport({
		challenges,
		activities: acts("AMAMAMAMAA"),
		logs: ["やってみる", "またやってみる", "休む"],
	});
	assert.strictEqual(report.totalChallengeCount, 4);
	assert.strictEqual(report.newExperimentRate, 0.5);
	assert.deepStrictEqual(report.challengeDomains.sort(), ["exercise", "study"]);
	assert.strictEqual(report.failedChallengeCount, 1);
	assert.strictEqual(report.bounceBackRate, 1);
	assert.strictEqual(report.resilienceIndex, 4);
	assert.strictEqual(report.changeTalkRate, 2 / 3);
	// activities "AMAMAMAMAA": longest active streak = 2 (idx8,9) -> ~3 (round(2/66*100))
	assert.strictEqual(report.habitAutomaticity, 3);
});

assert.ok(true);
