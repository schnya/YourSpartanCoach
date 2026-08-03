import assert from "node:assert";
import type { messagingApi, WebhookEvent } from "@line/bot-sdk";
import { readDailyLog } from "../../shared/memory/dailyLogStore.js";
import webhookApp, { processSingleEvent } from "./webhook.js";

interface DenoTestContext {
	step: (name: string, fn: () => void | Promise<void>) => Promise<boolean>;
}

declare const Deno: {
	test: (name: string, fn: (t: DenoTestContext) => void | Promise<void>) => void;
	remove: (path: string) => Promise<void>;
};

Deno.test("Webhook Endpoint & FP Handler Tests", async (t) => {
	// Test 1: Guard Clause - Missing Signature Header returns 401
	await t.step("Missing x-line-signature header returns 401", async () => {
		const res = await webhookApp.request("/", {
			method: "POST",
			body: JSON.stringify({ events: [] }),
		});
		assert.strictEqual(res.status, 401);
		assert.strictEqual(await res.text(), "Missing signature");
	});

	// Test 2: Invalid JSON body with signature returns 400
	await t.step("Invalid JSON body returns 400", async () => {
		const res = await webhookApp.request("/", {
			method: "POST",
			headers: { "x-line-signature": "dummy_sig" },
			body: "{ invalid json",
		});
		assert.strictEqual(res.status, 400);
	});

	// Test 3: Empty events array with signature returns 200 OK
	await t.step("Empty events array returns 200 OK", async () => {
		const res = await webhookApp.request("/", {
			method: "POST",
			headers: { "x-line-signature": "dummy_sig" },
			body: JSON.stringify({ events: [] }),
		});
		assert.strictEqual(res.status, 200);
		assert.strictEqual(await res.text(), "OK");
	});

	// Test 4: Single text event records exactly ONE [User Input] line (regression).
	// Before the fix, webhook.ts appended once and handleUserLogMessage appended
	// again, producing a duplicated [User Input] line. The local .md log persists
	// across runs, so reset it first for deterministic isolation.
	await t.step("Single text event is logged once (no duplication)", async () => {
		const userId = "test_user_dup_123";
		const today = new Date().toLocaleDateString("en-CA", {
			timeZone: "Asia/Tokyo",
		});
		const logPath = `./memory/users/${userId}/logs/${today}.md`;
		try {
			await Deno.remove(logPath);
		} catch {
			// file may not exist yet — fine
		}
		const fakeClient = {
			replyMessage: async () => ({}),
		} as unknown as messagingApi.MessagingApiClient;
		await processSingleEvent(
			{
				type: "message",
				timestamp: Date.now(),
				source: { type: "user", userId },
				replyToken: "dummy-reply-token",
				message: {
					type: "text",
					id: "msg-1",
					text: "些細なことでも驚くことにしました！",
				},
				mode: "active",
				webhookEventId: `evt-${Date.now()}-unique`,
			} as unknown as WebhookEvent,
			{ client: fakeClient, blobClient: null },
		);
		const log = await readDailyLog(userId, today);
		const userInputCount = (log.match(/\[User Input/g) || []).length;
		assert.strictEqual(
			userInputCount,
			1,
			`Expected exactly 1 [User Input] line, got ${userInputCount}:\n${log}`,
		);
	});
});
