import { serve } from "@hono/node-server";
import dotenv from "dotenv";
import { Hono } from "hono";
import cronApp from "./routes/cron.js";
import webhookApp from "./routes/webhook.js";

dotenv.config();

const app = new Hono();

app.get("/", (c) => {
	return c.text("LINE Companion Bot is running!");
});

// @lat: [[routing#Routing System]]
app.route("/webhook", webhookApp);
app.route("/cron", cronApp);

const port = Number(process.env.PORT) || 3000;
console.log(`Server starting on port ${port}...`);

serve({
	fetch: app.fetch,
	port,
});
