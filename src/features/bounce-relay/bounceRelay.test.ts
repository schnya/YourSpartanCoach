import assert from "node:assert";
import type { messagingApi, WebhookEvent } from "@line/bot-sdk";
import app from "../../index.js";
import { readDailyLog } from "../../shared/memory/dailyLogStore.js";
import { pullAndClearBounceMessages } from "./bounceRelay.js";
import { BOUNCE_CMD_RE, processSingleEvent } from "../webhook-reply/webhook.js";

interface DenoTestContext {
	step: (name: string, fn: () => void | Promise<void>) => Promise<boolean>;
}

declare const Deno: {
	test: (name: string, fn: (t: DenoTestContext) => void | Promise<void>) => void;
	env: {
		set: (key: string, value: string) => void;
		get: (key: string) => string | undefined;
		toObject?: () => Record<string, string>;
	};
};

Deno.test("Bounce Relay & Command Interception Tests", async (t) => {
	await t.step("BOUNCE_CMD_RE regex matching", () => {
		assert.strictEqual(BOUNCE_CMD_RE.test("/dev"), true);
		assert.strictEqual(BOUNCE_CMD_RE.test("/dev task implementation"), true);
		assert.strictEqual(BOUNCE_CMD_RE.test("/IDEA new feature"), true);
		assert.strictEqual(BOUNCE_CMD_RE.test("/log finished review"), true);
		assert.strictEqual(BOUNCE_CMD_RE.test("/notice update status"), true);
		assert.strictEqual(BOUNCE_CMD_RE.test("hello /dev"), false);
		assert.strictEqual(BOUNCE_CMD_RE.test("/device"), false);
		assert.strictEqual(BOUNCE_CMD_RE.test("/login"), false);
	});

	await t.step("Bounce command is intercepted and enqueued to Deno KV", async () => {
		const userId = "user_bounce_test_123";
		const fakeClient = {
			replyMessage: async () => ({}),
		} as unknown as messagingApi.MessagingApiClient;

		await processSingleEvent(
			{
				type: "message",
				timestamp: 1700000000000,
				source: { type: "user", userId },
				replyToken: "dummy-reply-token",
				message: {
					type: "text",
					id: "msg-bounce-1",
					text: "/dev implementing bounce relay feature",
				},
				mode: "active",
				webhookEventId: `evt-bounce-${Date.now()}`,
			} as unknown as WebhookEvent,
			{ client: fakeClient, blobClient: null },
		);

		const pending = await pullAndClearBounceMessages();
		const matched = pending.find((m) => m.userId === userId);
		assert.ok(matched, "Pending bounce message should be found in Deno KV");
		assert.strictEqual(matched?.text, "/dev implementing bounce relay feature");
		assert.strictEqual(
			matched?.receivedAt,
			new Date(1700000000000).toISOString(),
		);

		// Spartan daily log should NOT have been updated
		const today = new Date().toLocaleDateString("en-CA", {
			timeZone: "Asia/Tokyo",
		});
		const log = await readDailyLog(userId, today);
		assert.strictEqual(log.includes("/dev implementing bounce relay"), false);
	});

	await t.step("POST /api/pull-bounce endpoint authorization & payload", async () => {
		Deno.env.set("BOUNCE_SECRET", "test-bounce-secret-123");

		// Unauthorized without header
		const unauthRes = await app.request("/api/pull-bounce", {
			method: "POST",
		});
		assert.strictEqual(unauthRes.status, 401);

		// Authorized with x-bounce-secret header
		const authRes = await app.request("/api/pull-bounce", {
			method: "POST",
			headers: {
				"x-bounce-secret": "test-bounce-secret-123",
			},
		});
		assert.strictEqual(authRes.status, 200);
		const json = (await authRes.json()) as { messages: unknown[] };
		assert.ok(Array.isArray(json.messages));
	});

	await t.step("pullAndClearBounceMessages returns items in FIFO order (receivedAt ascending)", async () => {
		const fakeClient = { replyMessage: async () => ({}) } as any;
		await processSingleEvent(
			{
				type: "message",
				timestamp: 1700000200000,
				source: { type: "user", userId: "u_fifo" },
				replyToken: "tok-2",
				message: { type: "text", id: "m2", text: "/log second message" },
				mode: "active",
				webhookEventId: "evt-fifo-2",
			} as any,
			{ client: fakeClient, blobClient: null },
		);
		await processSingleEvent(
			{
				type: "message",
				timestamp: 1700000100000,
				source: { type: "user", userId: "u_fifo" },
				replyToken: "tok-1",
				message: { type: "text", id: "m1", text: "/dev first message" },
				mode: "active",
				webhookEventId: "evt-fifo-1",
			} as any,
			{ client: fakeClient, blobClient: null },
		);

		const pending = await pullAndClearBounceMessages();
		const fifoItems = pending.filter((m) => m.userId === "u_fifo");
		assert.strictEqual(fifoItems.length, 2);
		assert.strictEqual(fifoItems[0].text, "/dev first message");
		assert.strictEqual(fifoItems[1].text, "/log second message");
	});
});
