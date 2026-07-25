import {
	messagingApi,
	validateSignature,
	type WebhookEvent,
	type WebhookRequestBody,
} from "@line/bot-sdk";
import type { Context } from "hono";
import { Hono } from "hono";
import {
	handleImageMessage,
	handleMorningPlanMessage,
	handleTextProofMessage,
} from "../handlers/messageHandlers.js";
import { handlePostbackEvent } from "../handlers/postbackHandlers.js";
import {
	appendRawUserLog,
	checkAndMarkEventProcessed,
	getTodayDateString,
} from "../services/memory/dailyLogStore.js";
import { getUserState } from "../services/memory/fsmStore.js";

// @lat: [[routing#Webhook Endpoint]]
const webhookApp = new Hono();

interface LineClients {
	client: messagingApi.MessagingApiClient | null;
	blobClient: messagingApi.MessagingApiBlobClient | null;
}

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

function createLineClients(channelAccessToken: string): LineClients {
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
	clients: LineClients,
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

	if (event.type === "message" && event.message.type === "text") {
		await appendRawUserLog(userId, today, event.message.text.trim());
	}

	const stateData = await getUserState(userId);
	const replyToken = "replyToken" in event ? event.replyToken : undefined;

	if (event.type === "postback" && replyToken && clients.client) {
		return await handlePostbackEvent(event, stateData, clients.client);
	}

	if (event.type === "message" && replyToken && clients.client) {
		if (event.message.type === "image" && clients.blobClient) {
			return await handleImageMessage(
				event.message.id,
				stateData,
				userId,
				replyToken,
				clients.client,
				clients.blobClient,
			);
		}

		if (event.message.type === "text") {
			const text = event.message.text.trim();
			console.log(
				`[Webhook Text Message Received]: ${text} in state=${stateData.state}`,
			);

			if (stateData.state === "IDLE" || stateData.state === "PENDING") {
				return await handleMorningPlanMessage(
					userId,
					text,
					stateData,
					replyToken,
					clients.client,
				);
			}

			if (stateData.state === "REPORTING") {
				return await handleTextProofMessage(
					userId,
					text,
					stateData,
					replyToken,
					clients.client,
				);
			}

			return await clients.client.replyMessage({
				replyToken,
				messages: [{ type: "text", text: "了解。ログに記録した。" }],
			});
		}
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
