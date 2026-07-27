import fs from "node:fs/promises";
import path from "node:path";
import { readFileWithFallback } from "./fileUtils.js";
import { getRedisClient } from "./redisClient.js";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");

export async function ensureDirectoryExists(dirPath: string) {
	try {
		await fs.mkdir(dirPath, { recursive: true });
	} catch (_err) {
		// Ignore error if directory already exists
	}
}

/**
 * Redisからキャッシュを取得する（副作用のないQuery関数）
 */
export async function getCachedProfile(userId: string): Promise<string | null> {
	const redis = getRedisClient();
	if (!redis) return null;
	try {
		return await redis.get<string>(`user:${userId}:profile`);
	} catch (err) {
		console.error("[Redis Read Profile Error]:", err);
		return null;
	}
}

/**
 * Redisにキャッシュを保存する（Mutation関数）
 */
export async function setCachedProfile(
	userId: string,
	content: string,
): Promise<void> {
	const redis = getRedisClient();
	if (!redis) return;
	try {
		await redis.set(`user:${userId}:profile`, content);
	} catch (err) {
		console.error("[Redis Write Profile Error]:", err);
	}
}

// @lat: [[memory#Local Markdown Store]]
export async function readUserProfile(userId: string): Promise<string> {
	const cached = await getCachedProfile(userId);
	if (cached) return cached;

	const candidatePaths = [
		path.join(MEMORY_DIR, "users", userId, "USER_PROFILE.md"),
		path.join(MEMORY_DIR, "USER_PROFILE.md"),
		path.join(MEMORY_DIR, "USER_PROFILE.sample.md"),
	];

	return readFileWithFallback(
		candidatePaths,
		"名前: ユーザー\n目標: 規律ある生活",
	);
}

// @lat: [[memory#Local Markdown Store]]
export async function saveUserProfile(
	userId: string,
	content: string,
): Promise<void> {
	await setCachedProfile(userId, content);

	try {
		const userDir = path.join(MEMORY_DIR, "users", userId);
		await ensureDirectoryExists(userDir);
		const userProfilePath = path.join(userDir, "USER_PROFILE.md");
		await fs.writeFile(userProfilePath, content, "utf-8");
	} catch (err) {
		console.error("[Local Write Profile Error]:", err);
	}
}

// @lat: [[memory#Local Markdown Store]]
export async function readPatterns(): Promise<string> {
	return readFileWithFallback(
		[path.join(MEMORY_DIR, "patterns.md")],
		"HP 3: 通常運転",
	);
}

export type PromptType = "morning" | "evening" | "progress";

// @lat: [[memory#Local Markdown Store]]
export async function readPromptTemplate(
	type: PromptType,
): Promise<string> {
	const candidatePaths = [
		path.join(MEMORY_DIR, `prompt_${type}.md`),
		path.join(MEMORY_DIR, `prompt_${type}.sample.md`),
	];

	return readFileWithFallback(candidatePaths, "");
}
