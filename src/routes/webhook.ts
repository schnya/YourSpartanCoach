import { messagingApi, validateSignature, type WebhookRequestBody } from "@line/bot-sdk";
import { Hono } from "hono";
import {
	appendRawUserLog,
	getTodayDateString,
} from "../services/memoryStore.js";

const webhookApp = new Hono();

webhookApp.post("/", async (c) => {
	try {
		const channelSecret = (process.env.LINE_CHANNEL_SECRET || (c.env as Record<string, string>)?.LINE_CHANNEL_SECRET || "").trim();
		const channelAccessToken = (process.env.LINE_CHANNEL_ACCESS_TOKEN || (c.env as Record<string, string>)?.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

		console.log(`[Webhook Env Check]: Token Length = ${channelAccessToken.length}, Secret Length = ${channelSecret.length}`);

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
		const client = channelAccessToken
			? new messagingApi.MessagingApiClient({ channelAccessToken })
			: null;

		if (body && Array.isArray(body.events)) {
			for (const event of body.events) {
				if (event.type === "message" && event.message.type === "text") {
					const text = event.message.text;
					const replyToken = event.replyToken;
					console.log(`[Webhook Message Received]: ${text}`);

					// 生ログ / タスクを記録
					await appendRawUserLog(today, text);

					// LINEへの定型返信
					if (client && replyToken) {
						const isTask = /^タスク[:：]/i.test(text.trim());
						const replyText = isTask
							? "メモったで！タスクに追加しておいたよ📝"
							: "了解！ログに記録しておいたで👍";

						try {
							await client.replyMessage({
								replyToken,
								messages: [{ type: "text", text: replyText }],
							});
							console.log("[LINE Reply Success]: Reply sent!");
						} catch (replyErr: unknown) {
							const detail = replyErr instanceof Error ? replyErr.message : String(replyErr);
							console.error("[LINE Reply Error Detail]: Failed to replyMessage:", detail);
						}
					} else {
						console.warn("[LINE Reply Warning]: Reply skipped. client is null (LINE_CHANNEL_ACCESS_TOKEN missing?) or replyToken missing.");
					}
				}
			}
		}

		return c.text("OK", 200);
	} catch (globalErr: unknown) {
		const errDetail = globalErr instanceof Error ? globalErr.message : String(globalErr);
		console.error("[Webhook Critical Error]:", errDetail);
		return c.text("Internal Server Error", 500);
	}
});

export default webhookApp;
