import dotenv from "dotenv";
import { Hono } from "hono";
import cronApp from "./routes/cron.js";
import webhookApp from "./routes/webhook.js";

dotenv.config();

const app = new Hono();

app.get("/", (c) => {
	return c.text("LINE Companion Bot is running on Deno!");
});

// @lat: [[routing#Routing System]]
app.route("/webhook", webhookApp);
app.route("/cron", cronApp);

export default app;


