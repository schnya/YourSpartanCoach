import dotenv from "dotenv";
import { Hono } from "hono";
import cronApp from "./features/cron-push/cron.js";
import webhookApp from "./features/webhook-reply/webhook.js";

dotenv.config();

const app = new Hono();

app.get("/", (c) => {
	return c.text("ARES (Automated Rigorous Execution System) is running on Deno!");
});

// @lat: [[routing#Routing System]]
app.route("/webhook", webhookApp);
app.route("/cron", cronApp);

export default app;


