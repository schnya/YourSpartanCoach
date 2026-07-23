import { validateSignature, type WebhookRequestBody } from "@line/bot-sdk";
import { Hono } from "hono";
import {
	appendRawUserLog,
	getTodayDateString,
} from "../services/memoryStore.js";

const webhookApp = new Hono();

const channelSecret = process.env.LINE_CHANNEL_SECRET || "";

webhookApp.post("/", async (c) => {
	const signature = c.req.header("x-line-signature");
	const bodyText = await c.req.text();

	if (channelSecret && signature) {
		const isValid = validateSignature(bodyText, channelSecret, signature);
		if (!isValid) {
			return c.text("Invalid signature", 401);
		}
	}

	const body: WebhookRequestBody = JSON.parse(bodyText);
	const today = getTodayDateString();

	for (const event of body.events) {
		if (event.type === "message" && event.message.type === "text") {
			const text = event.message.text;
			console.log(`[Webhook Message Received]: ${text}`);

			// 生ログを daily/YYYY-MM-DD.md に追記
			await appendRawUserLog(today, text);
		}
	}

	return c.text("OK", 200);
});

export default webhookApp;
