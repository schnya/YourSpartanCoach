import {
	messagingApi,
	validateSignature,
	type WebhookEvent,
	type WebhookRequestBody,
} from "@line/bot-sdk";
import type { Context } from "hono";
import { Hono } from "hono";
import { handleUserLogMessage } from "../handlers/messageHandlers.js";
import { appendRawUserLog, checkAndMarkEventProcessed, getTodayDateString } from "../services/memory/dailyLogStore.js";

// @lat: [[routing#Webhook Endpoint]]
const webhookApp = new Hono();

function getLineConfig(c: Context) {
	const env = (c.env as Record<string, string>) || {};
	const channelSecret = (
		process.env.LINE_CHANNEL_SECRET ||
		env.LINE_CHANNEL_SECRET ||
		""
	).trim();
	const channelAccessToken = (
		process.env.LINE_CHANNEL_ACCESS_TOKEN ||
		env.LINE_CHANNEL_ACCESS_TOKEN ||
		""
	).trim();
	return { channelSecret, channelAccessToken };
}

function createLineClients(channelAccessToken: string) {
	if (!channelAccessToken) return { client: null, blobClient: null };
	return {
		client: new messagingApi.MessagingApiClient({ channelAccessToken }),
		blobClient: new messagingApi.MessagingApiBlobClient({
			channelAccessToken,
		}),
	};
}

async function processSingleEvent(
	event: WebhookEvent,
	clients: { client: messagingApi.MessagingApiClient | null; blobClient: messagingApi.MessagingApiBlobClient | null },
	today: string,
) {
	const eventId =
		event.webhookEventId || `${event.timestamp}-${event.source?.userId}`;
	const isDuplicate = await checkAndMarkEventProcessed(eventId);
	if (isDuplicate) {
		console.warn(
			`[Webhook Warning]: Duplicate event detected and ignored: ${eventId}`,
		);
		return;
	}

	const userId = event.source?.userId;
	if (!userId) {
		console.warn("[Webhook Warning]: Event source userId is missing.");
		return;
	}

	// ユーザーからのテキスト・画像投稿はすべて「記録」として扱う
	if (event.type === "message" && userId) {
		const replyToken = "replyToken" in event ? event.replyToken : undefined;
		if (!replyToken || !clients.client) return;

		if (event.message.type === "text") {
			await appendRawUserLog(userId, today, event.message.text.trim());
			await handleUserLogMessage(
				userId,
				event.message.text.trim(),
				replyToken,
				clients.client,
				false,
			);
		} else if (event.message.type === "image") {
			await handleUserLogMessage(
				userId,
				"",
				replyToken,
				clients.client,
				true,
			);
		}
		// その他のメッセージタイプ（スタンプ等）はログのみ
	}
}

webhookApp.post("/", async (c) => {
	try {
		const { channelSecret, channelAccessToken } = getLineConfig(c);
		console.log(
			`[Webhook Env Check]: Token Length = ${channelAccessToken.length}, Secret Length = ${channelSecret.length}`,
		);

		const signature = c.req.header("x-line-signature");
		const bodyText = await c.req.text();

		if (!signature) {
			console.warn("[Webhook Warning]: Missing x-line-signature header");
			return c.text("Missing signature", 401);
		}

		if (channelSecret) {
			const isValid = validateSignature(bodyText, channelSecret, signature);
			if (!isValid) {
				console.error("[Webhook Error]: Invalid signature verification failed");
				return c.text("Invalid signature", 401);
			}
		}

		let body: WebhookRequestBody;
		try {
			body = JSON.parse(bodyText);
		} catch (err) {
			console.error("[Webhook Error]: Failed to parse JSON body", err);
			return c.text("Bad Request", 400);
		}

		const today = getTodayDateString();
		const clients = createLineClients(channelAccessToken);

		if (body && Array.isArray(body.events)) {
			for (const event of body.events) {
				await processSingleEvent(event, clients, today);
			}
		}

		return c.text("OK", 200);
	} catch (globalErr: unknown) {
		const errDetail =
			globalErr instanceof Error ? globalErr.message : String(globalErr);
		console.error("[Webhook Critical Error]:", errDetail);
		return c.text("Internal Server Error", 500);
	}
});

export default webhookApp;
