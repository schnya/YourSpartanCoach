import fs from "node:fs/promises";
import path from "node:path";
import { tz } from "@date-fns/tz";
import { format, subDays } from "date-fns";

import { ensureDirectoryExists } from "./profileStore.js";
import { getRedisClient } from "./redisClient.js";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");
const TZ_JST = tz("Asia/Tokyo");

export function getTodayDateString(): string {
	return format(new Date(), "yyyy-MM-dd", { in: TZ_JST });
}

const localProcessedEvents = new Set<string>();

export async function checkAndMarkEventProcessed(
	eventId: string,
): Promise<boolean> {
	if (localProcessedEvents.has(eventId)) {
		return true;
	}

	const redis = getRedisClient();
	if (redis) {
		try {
			const key = `event:${eventId}:processed`;
			const isSet = await redis.set(key, "1", { nx: true, ex: 86400 });
			if (!isSet) {
				localProcessedEvents.add(eventId);
				return true;
			}
		} catch (err) {
			console.error("[Redis Idempotency Check Error]:", err);
		}
	}

	localProcessedEvents.add(eventId);
	return false;
}

// @lat: [[memory#Daily Action Logs]]
export async function readDailyLog(
	userId: string,
	dateStr: string,
): Promise<string> {
	const redis = getRedisClient();
	if (redis) {
		try {
			const cached = await redis.get<string>(`user:${userId}:log:${dateStr}`);
			if (cached) return cached;
		} catch (err) {
			console.error("[Redis Read Log Error]:", err);
		}
	}

	try {
		const logPath = path.join(
			MEMORY_DIR,
			"users",
			userId,
			"logs",
			`${dateStr}.md`,
		);
		return await fs.readFile(logPath, "utf-8");
	} catch {
		return `# Daily Log: ${dateStr}\n\n## Scheduled Tasks\n- (None)\n\n## Status Updates\n`;
	}
}

// @lat: [[memory#Daily Action Logs]]
export async function saveDailyLog(
	userId: string,
	dateStr: string,
	content: string,
): Promise<void> {
	const redis = getRedisClient();
	if (redis) {
		try {
			await redis.set(`user:${userId}:log:${dateStr}`, content);
		} catch (err) {
			console.error("[Redis Write Log Error]:", err);
		}
	}

	try {
		const userLogsDir = path.join(MEMORY_DIR, "users", userId, "logs");
		await ensureDirectoryExists(userLogsDir);
		const logPath = path.join(userLogsDir, `${dateStr}.md`);
		await fs.writeFile(logPath, content, "utf-8");
	} catch (err) {
		console.error("[Local Write Log Error]:", err);
	}
}

export async function appendPlannedTask(
	userId: string,
	dateStr: string,
	taskText: string,
): Promise<void> {
	const currentLog = await readDailyLog(userId, dateStr);
	const updatedLog = currentLog.replace(
		"## Scheduled Tasks\n- (None)",
		`## Scheduled Tasks\n- ${taskText}`,
	);
	if (updatedLog !== currentLog) {
		await saveDailyLog(userId, dateStr, updatedLog);
	} else {
		await saveDailyLog(
			userId,
			dateStr,
			`${currentLog}\n- ${taskText} (Added at ${new Date().toISOString()})`,
		);
	}
}

export async function appendRawUserLog(
	userId: string,
	dateStr: string,
	logText: string,
): Promise<void> {
	const currentLog = await readDailyLog(userId, dateStr);
	const timeStr = new Date().toLocaleTimeString("ja-JP", {
		timeZone: "Asia/Tokyo",
		hour: "2-digit",
		minute: "2-digit",
	});
	const updatedLog = `${currentLog}\n[User Input ${timeStr}]: ${logText}`;
	await saveDailyLog(userId, dateStr, updatedLog);
}

export async function appendSentMessage(
	userId: string,
	dateStr: string,
	title: string,
	message: string,
): Promise<void> {
	const currentLog = await readDailyLog(userId, dateStr);
	const timeStr = new Date().toLocaleTimeString("ja-JP", {
		timeZone: "Asia/Tokyo",
		hour: "2-digit",
		minute: "2-digit",
	});
	const updatedLog = `${currentLog}\n[ARES ${title} ${timeStr}]: ${message}`;
	await saveDailyLog(userId, dateStr, updatedLog);
}

export function extractUncompletedTasks(logContent: string): string[] {
	const taskLines: string[] = [];
	const scheduledSectionMatch = logContent.match(
		/## Scheduled Tasks\n([\s\S]*?)(?=\n## |$)/,
	);
	if (scheduledSectionMatch?.[1]) {
		const rawLines = scheduledSectionMatch[1].split("\n");
		for (const line of rawLines) {
			const trimmed = line.trim();
			if (
				trimmed.startsWith("- ") &&
				!trimmed.includes("(Completed)") &&
				!trimmed.includes("(None)")
			) {
				taskLines.push(trimmed.substring(2));
			}
		}
	}
	return taskLines;
}

export async function carryOverPendingTasks(
	userId: string,
	todayStr: string,
): Promise<string[]> {
	const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd", {
		in: TZ_JST,
	});

	const yesterdayLog = await readDailyLog(userId, yesterdayStr);
	const taskLines = extractUncompletedTasks(yesterdayLog);

	if (taskLines.length > 0) {
		for (const task of taskLines) {
			await appendPlannedTask(userId, todayStr, `[Carryover] ${task}`);
		}
	}

	return taskLines;
}
