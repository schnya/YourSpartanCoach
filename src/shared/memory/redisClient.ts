import { Redis } from "@upstash/redis";

// @lat: [[memory#Upstash Redis Store]]
let redisUnavailableWarned = false;

export function getRedisClient(): Redis | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (url && token && url !== "your_upstash_redis_rest_url_here") {
		return new Redis({ url, token });
	}
	if (!redisUnavailableWarned) {
		redisUnavailableWarned = true;
		console.warn(
			"[FSM Store] Upstash Redis env (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) is missing or still placeholder. " +
				"On serverless (Deno Deploy) the FSM state will NOT persist across requests, so /progress keeps reading a fresh IDLE state and skips pushes as 'Inactive (LINE unchecked)'. " +
				"Set the real Upstash credentials in the deploy environment to fix persistence.",
		);
	}
	return null;
}
