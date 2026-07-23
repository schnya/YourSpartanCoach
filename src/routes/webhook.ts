import { messagingApi, validateSignature, type WebhookRequestBody } from "@line/bot-sdk";
import { Hono } from "hono";
import {
	appendRawUserLog,
	getTodayDateString,
} from "../services/memoryStore.js";

const webhookApp = new Hono();

const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

webhookApp.post("/", async (c) => {
	const signature = c.req.header("x-line-signature");
	const bodyText = await c.req.text();

	if (channelSecret && signature) {
		const isValid = validateSignature(bodyText, channelSecret, signature);
		if (!isValid) {
			console.error("[Webhook Error]: Invalid signature");
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
	const client = channelAccessToken
		? new messagingApi.MessagingApiClient({ channelAccessToken })
		: null;

	for (const event of body.events) {
		if (event.type === "message" && event.message.type === "text") {
			const text = event.message.text;
			const replyToken = event.replyToken;
			console.log(`[Webhook Message Received]: ${text}`);

			try {
				// 生ログ / タスクを記録
				await appendRawUserLog(today, text);

				// LINEへの定型返信
				if (client && replyToken) {
					const isTask = /^タスク[:：]/i.test(text.trim());
					const replyText = isTask
						? "メモったで！タスクに追加しておいたよ📝"
						: "了解！ログに記録しておいたで👍";

					await client.replyMessage({
						replyToken,
						messages: [{ type: "text", text: replyText }],
					});
				}
			} catch (err: unknown) {
				const errorDetail = err instanceof Error ? err.message : String(err);
				console.error("[Webhook Processing Error]:", errorDetail);
			}
		}
	}

	return c.text("OK", 200);
});

export default webhookApp;
