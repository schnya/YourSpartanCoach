import { Hono } from "hono";
import { handle } from "hono/vercel";
import cronApp from "../src/routes/cron.js";
import webhookApp from "../src/routes/webhook.js";

const app = new Hono();

app.get("/", (c) => {
  return c.text("LINE Companion Bot is running!");
});

app.route("/webhook", webhookApp);
app.route("/cron", cronApp);

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);

export default app;
