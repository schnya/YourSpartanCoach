import type { Context } from "hono";
import { Hono } from "hono";

export interface PendingBounceMessage {
	id: string;
	userId: string;
	text: string;
	receivedAt: string;
}

let kvInstance: Deno.Kv | null = null;

async function getKv(): Promise<Deno.Kv> {
	if (!kvInstance) {
		kvInstance = await Deno.openKv();
	}
	return kvInstance;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function enqueueBounceMessage(
	msg: PendingBounceMessage,
): Promise<void> {
	const kv = await getKv();
	await kv.set(["bounce_pending", msg.id], msg, { expireIn: SEVEN_DAYS_MS });
}

export async function pullAndClearBounceMessages(): Promise<
	PendingBounceMessage[]
> {
	const kv = await getKv();
	const iter = kv.list<PendingBounceMessage>({ prefix: ["bounce_pending"] });
	const messages: PendingBounceMessage[] = [];
	const keysToDelete: Deno.KvKey[] = [];

	for await (const entry of iter) {
		if (entry.value) {
			messages.push(entry.value);
			keysToDelete.push(entry.key);
		}
	}

	if (keysToDelete.length > 0) {
		let atomic = kv.atomic();
		for (const key of keysToDelete) {
			atomic = atomic.delete(key);
		}
		await atomic.commit();
	}

	messages.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
	return messages;
}

const bounceRelayApp = new Hono();

bounceRelayApp.post("/pull-bounce", async (c: Context) => {
	const env = (c.env as Record<string, string>) || {};
	const expectedSecret = (
		Deno.env.get("BOUNCE_SECRET") ||
		process.env.BOUNCE_SECRET ||
		env.BOUNCE_SECRET ||
		""
	).trim();

	const authHeader = c.req.header("authorization") || "";
	const headerSecret = c.req.header("x-bounce-secret") || "";
	const bearerToken = authHeader.startsWith("Bearer ")
		? authHeader.slice(7).trim()
		: "";

	const providedSecret = headerSecret || bearerToken;

	if (
		!expectedSecret ||
		!providedSecret ||
		providedSecret !== expectedSecret
	) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	try {
		const messages = await pullAndClearBounceMessages();
		return c.json({ messages });
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[Bounce Relay Error]:", msg);
		return c.json({ error: "Internal Server Error" }, 500);
	}
});

export default bounceRelayApp;
