import assert from "node:assert";
import { NUDGE_INTERVAL_MS, shouldSendNoResponseNudge } from "./helper.js";

declare const Deno: {
	test: (name: string, fn: () => void | Promise<void>) => void;
};

const now = Date.parse("2026-08-04T12:00:00.000Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

Deno.test("no-response nudge waits four hours", () => {
	assert.equal(shouldSendNoResponseNudge(ago(NUDGE_INTERVAL_MS - 1), undefined, now), false);
	assert.equal(shouldSendNoResponseNudge(ago(NUDGE_INTERVAL_MS), undefined, now), true);
});

Deno.test("no-response nudge does not repeat within four hours", () => {
	assert.equal(
		shouldSendNoResponseNudge(ago(NUDGE_INTERVAL_MS * 2), ago(NUDGE_INTERVAL_MS - 1), now),
		false,
	);
	assert.equal(
		shouldSendNoResponseNudge(ago(NUDGE_INTERVAL_MS * 2), ago(NUDGE_INTERVAL_MS), now),
		true,
	);
});

Deno.test("no-response nudge requires a known reply timestamp", () => {
	assert.equal(shouldSendNoResponseNudge(undefined, undefined, now), false);
});
