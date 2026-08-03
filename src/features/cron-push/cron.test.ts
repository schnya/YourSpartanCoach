import assert from "node:assert";
import { BATH_REMINDER_MESSAGE, isBathReminderHour, shouldSendNoResponseNudge } from "./cron.js";
import { getBathReminderDay, NUDGE_INTERVAL_MS } from "./helper.js";

declare const Deno: {
	test: (name: string, fn: () => void | Promise<void>) => void;
};

Deno.test("bath reminder is enabled from 19:00 through 02:59 JST", () => {
	assert.equal(isBathReminderHour(new Date("2026-08-04T10:00:00.000Z")), true);
	assert.equal(isBathReminderHour(new Date("2026-08-04T17:00:00.000Z")), true);
	assert.equal(isBathReminderHour(new Date("2026-08-04T18:00:00.000Z")), false);
	assert.equal(isBathReminderHour(new Date("2026-08-04T08:59:59.000Z")), false);
});

Deno.test("bath reminder uses a fixed message", () => {
	assert.ok(BATH_REMINDER_MESSAGE.includes("1〜2時間前"));
	assert.ok(BATH_REMINDER_MESSAGE.includes("40〜42.5℃"));
});

Deno.test("bath reminder day treats 00:00-02:59 as the previous evening", () => {
	assert.equal(
		getBathReminderDay(new Date("2026-08-04T16:00:00.000Z")),
		"2026-08-04",
	);
	assert.equal(
		getBathReminderDay(new Date("2026-08-04T17:00:00.000Z")),
		"2026-08-04",
	);
});

const now = Date.parse("2026-08-04T12:00:00.000Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

Deno.test("no-response nudge waits four hours", () => {
	assert.equal(
		shouldSendNoResponseNudge(ago(NUDGE_INTERVAL_MS - 1), undefined, now),
		false,
	);
	assert.equal(
		shouldSendNoResponseNudge(ago(NUDGE_INTERVAL_MS), undefined, now),
		true,
	);
});

Deno.test("no-response nudge does not repeat within four hours", () => {
	assert.equal(
		shouldSendNoResponseNudge(
			ago(NUDGE_INTERVAL_MS * 2),
			ago(NUDGE_INTERVAL_MS - 1),
			now,
		),
		false,
	);
	assert.equal(
		shouldSendNoResponseNudge(
			ago(NUDGE_INTERVAL_MS * 2),
			ago(NUDGE_INTERVAL_MS),
			now,
		),
		true,
	);
});

Deno.test("no-response nudge requires a known reply timestamp", () => {
	assert.equal(shouldSendNoResponseNudge(undefined, undefined, now), false);
});
