import fs from "node:fs/promises";
import path from "node:path";
import { getRedisClient } from "./redisClient.js";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");

export async function ensureDirectoryExists(dirPath: string) {
	try {
		await fs.mkdir(dirPath, { recursive: true });
	} catch (_err) {
		// Ignore error if directory already exists
	}
}

// @lat: [[memory#Local Markdown Store]]
export async function readUserProfile(userId: string): Promise<string> {
	const redis = getRedisClient();
	if (redis) {
		try {
			const cached = await redis.get<string>(`user:${userId}:profile`);
			if (cached) return cached;
		} catch (err) {
			console.error("[Redis Read Profile Error]:", err);
		}
	}

	try {
		const userProfilePath = path.join(
			MEMORY_DIR,
			"users",
			userId,
			"USER_PROFILE.md",
		);
		return await fs.readFile(userProfilePath, "utf-8");
	} catch {
		try {
			const filePath = path.join(MEMORY_DIR, "USER_PROFILE.md");
			return await fs.readFile(filePath, "utf-8");
		} catch {
			try {
				const samplePath = path.join(MEMORY_DIR, "USER_PROFILE.sample.md");
				return await fs.readFile(samplePath, "utf-8");
			} catch {
				return "名前: ユーザー\n目標: 規律ある生活";
			}
		}
	}
}

// @lat: [[memory#Local Markdown Store]]
export async function saveUserProfile(
	userId: string,
	content: string,
): Promise<void> {
	const redis = getRedisClient();
	if (redis) {
		try {
			await redis.set(`user:${userId}:profile`, content);
		} catch (err) {
			console.error("[Redis Write Profile Error]:", err);
		}
	}

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
	try {
		const filePath = path.join(MEMORY_DIR, "patterns.md");
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return "HP 3: 通常運転";
	}
}

// @lat: [[memory#Local Markdown Store]]
export async function readPromptTemplate(
	type: "morning" | "evening",
): Promise<string> {
	const filename = `prompt_${type}.md`;
	try {
		const filePath = path.join(MEMORY_DIR, filename);
		return await fs.readFile(filePath, "utf-8");
	} catch {
		try {
			const sampleFilename = `prompt_${type}.sample.md`;
			const samplePath = path.join(MEMORY_DIR, sampleFilename);
			return await fs.readFile(samplePath, "utf-8");
		} catch {
			return "";
		}
	}
}
