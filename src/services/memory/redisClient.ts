import { Redis } from "@upstash/redis";

// @lat: [[memory#Upstash Redis Store]]
export function getRedisClient(): Redis | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (url && token && url !== "your_upstash_redis_rest_url_here") {
		return new Redis({ url, token });
	}
	return null;
}
