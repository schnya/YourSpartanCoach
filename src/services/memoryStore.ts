import fs from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");
const IS_VERCEL = !!process.env.VERCEL;

// @lat: [[memory#Upstash Redis Store]]
function getRedisClient(): Redis | null {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (url && token && url !== "your_upstash_redis_rest_url_here") {
		return new Redis({ url, token });
	}
	return null;
}

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

	// Fallback to local files
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
	type: "morning" | "evening" | "accountability" | "task_planning",
): Promise<string> {
	const filename = `prompt_${type}.md`;
	const sampleFilename = `prompt_${type}.sample.md`;

	try {
		const filePath = path.join(MEMORY_DIR, filename);
		return await fs.readFile(filePath, "utf-8");
	} catch {
		try {
			const samplePath = path.join(MEMORY_DIR, sampleFilename);
			return await fs.readFile(samplePath, "utf-8");
		} catch {
			if (type === "morning") return "朝のメッセージを生成してください。";
			if (type === "evening") return "夜のメッセージを生成してください。";
			if (type === "accountability")
				return "目標と実際の行動の差分を分析してください。";
			return "タスクの優先順位を整理してください。";
		}
	}
}

export function getTodayDateString(): string {
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Tokyo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return formatter.format(new Date());
}

// @lat: [[memory#Daily Action Logs]]
export async function readDailyLog(
	userId: string,
	dateStr: string,
): Promise<string> {
	const redis = getRedisClient();
	if (redis) {
		try {
			const data = await redis.get<string>(`user:${userId}:daily:${dateStr}`);
			if (data) return data;
		} catch (err: unknown) {
			console.error("[Redis Daily Read Error]:", err);
		}
	}

	try {
		const userDailyDir = IS_VERCEL
			? path.resolve("/tmp", "users", userId, "daily")
			: path.resolve(MEMORY_DIR, "users", userId, "daily");
		const filePath = path.join(userDailyDir, `${dateStr}.md`);
		return await fs.readFile(filePath, "utf-8");
	} catch {
		// Fallback to non-tenant files
		try {
			const dailyDir = IS_VERCEL
				? path.resolve("/tmp", "daily")
				: path.resolve(MEMORY_DIR, "daily");
			const filePath = path.join(dailyDir, `${dateStr}.md`);
			return await fs.readFile(filePath, "utf-8");
		} catch {
			return `# ${dateStr}\n\n## Status\nHP: 3\n\n## Morning Sent\n\n## Raw Logs\n\n## Evening Sent\n`;
		}
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
			await redis.set(`user:${userId}:daily:${dateStr}`, content);
		} catch (err: unknown) {
			console.error("[Redis Daily Write Error]:", err);
		}
	}

	try {
		const userDailyDir = IS_VERCEL
			? path.resolve("/tmp", "users", userId, "daily")
			: path.resolve(MEMORY_DIR, "users", userId, "daily");
		await ensureDirectoryExists(userDailyDir);
		const filePath = path.join(userDailyDir, `${dateStr}.md`);
		await fs.writeFile(filePath, content, "utf-8");
	} catch (_err) {
		// Ignore local write errors in Vercel if Redis succeeds
	}
}

// @lat: [[memory#Daily Action Logs]]
export async function getRecentLogs(
	userId: string,
	days: number = 3,
): Promise<string[]> {
	const logs: string[] = [];
	const now = new Date();

	for (let i = 0; i < days; i++) {
		const targetDate = new Date(now);
		targetDate.setDate(now.getDate() - i);
		const formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Tokyo",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		const dateStr = formatter.format(targetDate);
		const log = await readDailyLog(userId, dateStr);
		logs.push(log);
	}

	return logs;
}

export async function resolveCurrentHp(
	recentLogs: string[],
): Promise<number> {
	for (const log of recentLogs) {
		const match = log.match(/HP:\s*(\d)/i);
		if (match?.[1]) {
			return Number(match[1]);
		}
	}
	return 3;
}

// @lat: [[memory#Daily Action Logs]]
export async function appendPlannedTask(
	userId: string,
	dateStr: string,
	taskText: string,
) {
	let content = await readDailyLog(userId, dateStr);

	const taskLine = `- [ ] ${taskText.trim()}\n`;

	if (content.includes("## Planned Tasks")) {
		content = content.replace(
			"## Planned Tasks\n",
			`## Planned Tasks\n${taskLine}`,
		);
	} else {
		content += `\n## Planned Tasks\n${taskLine}`;
	}

	await saveDailyLog(userId, dateStr, content);
}

// @lat: [[memory#Daily Action Logs]]
export async function appendRawUserLog(
	userId: string,
	dateStr: string,
	text: string,
) {
	let content = await readDailyLog(userId, dateStr);

	const timeStr = new Date().toLocaleTimeString("ja-JP", {
		timeZone: "Asia/Tokyo",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});

	const isTaskCommand = /^タスク[:：]/i.test(text.trim());
	const isCompleteCommand = /^(?:完了|done)[:：\s]/i.test(text.trim());

	// 「タスク:」で始まる場合は ## Planned Tasks に追加
	const taskMatch = text.match(/^タスク[:：]\s*(.+)$/s);
	if (taskMatch?.[1]) {
		const taskBody = taskMatch[1].trim();
		const taskLine = `- [ ] ${taskBody}\n`;

		if (content.includes("## Planned Tasks")) {
			content = content.replace(
				"## Planned Tasks\n",
				`## Planned Tasks\n${taskLine}`,
			);
		} else {
			content += `\n## Planned Tasks\n${taskLine}`;
		}
	}

	// HP指定を含む発言があった場合、Statusも更新
	const hpMatch = text.match(/HP[:：\s]*([1-5])/i);
	if (hpMatch?.[1]) {
		const newHp = hpMatch[1];
		if (content.includes("HP:")) {
			content = content.replace(/HP:\s*\d/, `HP: ${newHp}`);
		}
	}

	// タスク追加コマンド・タスク完了コマンドの場合は ## Raw Logs に重複して記録しない
	if (!isTaskCommand && !isCompleteCommand) {
		const logLine = `- ${timeStr} USER: ${text.replace(/\n/g, " ")}\n`;

		if (content.includes("## Raw Logs")) {
			content = content.replace("## Raw Logs\n", `## Raw Logs\n${logLine}`);
		} else {
			content += `\n## Raw Logs\n${logLine}`;
		}
	}

	await saveDailyLog(userId, dateStr, content);
}

// @lat: [[memory#Daily Action Logs]]
export async function carryOverPendingTasks(
	userId: string,
	yesterdayDateStr: string,
	todayDateStr: string,
): Promise<number> {
	const yesterdayLog = await readDailyLog(userId, yesterdayDateStr);
	if (!yesterdayLog.includes("## Planned Tasks")) {
		return 0;
	}

	// 前日の ## Planned Tasks セクションから未完了タスク（- [ ] ）を抽出
	const tasksSectionMatch = yesterdayLog.match(
		/## Planned Tasks\n([\s\S]*?)(?=\n## |$)/,
	);
	if (!tasksSectionMatch?.[1]) {
		return 0;
	}

	const lines = tasksSectionMatch[1].split("\n");
	const pendingTasks: string[] = [];

	for (const line of lines) {
		const match = line.match(/^-\s*\[\s*\]\s*(.+)$/);
		if (match?.[1]) {
			// (carried) の重複付与を防止しつつクリーンなタスク名を取り出す
			const cleanTaskName = match[1].replace(/\s*\(carried\)$/i, "").trim();
			pendingTasks.push(cleanTaskName);
		}
	}

	if (pendingTasks.length === 0) {
		return 0;
	}

	let todayLog = await readDailyLog(userId, todayDateStr);
	let carriedCount = 0;

	for (const taskName of pendingTasks) {
		// 当日ログに既に同名のタスクが存在するかチェック
		if (!todayLog.includes(taskName)) {
			const carriedTaskLine = `- [ ] ${taskName} (carried)\n`;
			if (todayLog.includes("## Planned Tasks")) {
				todayLog = todayLog.replace(
					"## Planned Tasks\n",
					`## Planned Tasks\n${carriedTaskLine}`,
				);
			} else {
				todayLog += `\n## Planned Tasks\n${carriedTaskLine}`;
			}
			carriedCount++;
		}
	}

	if (carriedCount > 0) {
		await saveDailyLog(userId, todayDateStr, todayLog);
	}

	return carriedCount;
}

export type CompleteTaskResult =
	| { status: "success"; taskText: string }
	| { status: "not_found" }
	| { status: "multiple"; matches: string[] };

// @lat: [[memory#Daily Action Logs]]
export async function markTaskAsCompleted(
	userId: string,
	todayDateStr: string,
	queryText: string,
): Promise<CompleteTaskResult> {
	const todayLog = await readDailyLog(userId, todayDateStr);
	if (!todayLog.includes("## Planned Tasks")) {
		return { status: "not_found" };
	}

	const tasksSectionMatch = todayLog.match(
		/## Planned Tasks\n([\s\S]*?)(?=\n## |$)/,
	);
	if (!tasksSectionMatch?.[1]) {
		return { status: "not_found" };
	}

	const lines = tasksSectionMatch[1].split("\n");
	const matchingTasks: string[] = [];

	const cleanQuery = queryText.trim().toLowerCase();

	for (const line of lines) {
		const match = line.match(/^-\s*\[\s*\]\s*(.+)$/);
		if (match?.[1]) {
			const taskText = match[1].trim();
			if (taskText.toLowerCase().includes(cleanQuery)) {
				matchingTasks.push(taskText);
			}
		}
	}

	if (matchingTasks.length === 0) {
		return { status: "not_found" };
	}

	if (matchingTasks.length > 1) {
		return { status: "multiple", matches: matchingTasks };
	}

	const targetTask = matchingTasks[0];
	// 対象の - [ ] タスクを - [x] タスクに置換
	const updatedLog = todayLog.replace(
		new RegExp(
			`-\\s*\\[\\s*\\]\\s*${targetTask.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
		),
		`- [x] ${targetTask}`,
	);

	await saveDailyLog(userId, todayDateStr, updatedLog);
	return { status: "success", taskText: targetTask };
}

// @lat: [[memory#Daily Action Logs]]
export async function appendSentMessage(
	userId: string,
	dateStr: string,
	type: "Morning" | "Evening",
	text: string,
) {
	let content = await readDailyLog(userId, dateStr);

	const timeStr = new Date().toLocaleTimeString("ja-JP", {
		timeZone: "Asia/Tokyo",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const sectionHeader =
		type === "Morning" ? "## Morning Sent" : "## Evening Sent";
	const sentLine = `- ${timeStr} ${text.replace(/\n/g, " ")}\n`;

	if (content.includes(sectionHeader)) {
		content = content.replace(
			`${sectionHeader}\n`,
			`${sectionHeader}\n${sentLine}`,
		);
	} else {
		content += `\n${sectionHeader}\n${sentLine}`;
	}

	await saveDailyLog(userId, dateStr, content);
}

// --- FSM STATE & DISCIPLINE SCORE MANAGEMENT ---

export type FsmState =
	| "IDLE"
	| "PENDING"
	| "SCHEDULED"
	| "EXECUTING"
	| "REPORTING"
	| "ESCAPED";

export interface FsmStateData {
	state: FsmState;
	metadata?: {
		taskText?: string;
		targetStartTime?: string; // format: "20:00"
		targetDuration?: number; // in minutes
		proofDefinition?: string;
		targetDateStr?: string;
		warningSent?: boolean;
		reportingDeadline?: string; // ISO String
		silentEscapedReason?: string;
		slicedTask?: boolean;
		physicalPostponeCount?: number;
	};
}

const localStateCache = new Map<string, FsmStateData>();
const localScoreCache = new Map<string, number>();

// @lat: [[memory#Daily Action Logs]]
export async function getUserState(userId: string): Promise<FsmStateData> {
	const redis = getRedisClient();
	if (redis) {
		try {
			const data = await redis.get<FsmStateData>(`user:${userId}:state`);
			if (data) return data;
		} catch (err) {
			console.error("[Redis Get State Error]:", err);
		}
	}
	return localStateCache.get(userId) || { state: "IDLE" };
}

// @lat: [[memory#Daily Action Logs]]
export async function setUserState(
	userId: string,
	state: FsmState,
	metadata?: FsmStateData["metadata"],
): Promise<void> {
	const redis = getRedisClient();
	const stateData: FsmStateData = { state, metadata };
	localStateCache.set(userId, stateData);
	if (redis) {
		try {
			await redis.set(`user:${userId}:state`, stateData);
		} catch (err) {
			console.error("[Redis Set State Error]:", err);
		}
	}

	// Mirror to daily log status for visibility
	const today = getTodayDateString();
	try {
		let log = await readDailyLog(userId, today);
		if (log.includes("State:")) {
			log = log.replace(
				/State:\s*\w+[\s\S]*?(?=\n##|$)/,
				`State: ${state}${metadata ? `\nMetadata: ${JSON.stringify(metadata)}` : ""}`,
			);
		} else {
			log = log.replace(
				"## Status\n",
				`## Status\nState: ${state}${metadata ? `\nMetadata: ${JSON.stringify(metadata)}` : ""}\n`,
			);
		}
		await saveDailyLog(userId, today, log);
	} catch (err) {
		console.error("[Mirror FSM State to Daily Log Error]:", err);
	}
}

// @lat: [[memory#Daily Action Logs]]
export async function getDisciplineScore(userId: string): Promise<number> {
	const redis = getRedisClient();
	if (redis) {
		try {
			const score = await redis.get<number>(`user:${userId}:score`);
			if (score !== null && score !== undefined) return score;
		} catch (err) {
			console.error("[Redis Get Score Error]:", err);
		}
	}
	return localScoreCache.get(userId) ?? 100;
}

// @lat: [[memory#Daily Action Logs]]
export async function updateDisciplineScore(
	userId: string,
	delta: number,
): Promise<number> {
	const current = await getDisciplineScore(userId);
	const updated = Math.max(0, Math.min(100, current + delta));
	localScoreCache.set(userId, updated);
	const redis = getRedisClient();
	if (redis) {
		try {
			await redis.set(`user:${userId}:score`, updated);
		} catch (err) {
			console.error("[Redis Set Score Error]:", err);
		}
	}

	// Mirror to daily log
	const today = getTodayDateString();
	try {
		let log = await readDailyLog(userId, today);
		if (log.includes("Discipline Score:")) {
			log = log.replace(
				/Discipline Score:\s*\d+/,
				`Discipline Score: ${updated}`,
			);
		} else {
			log = log.replace(
				"## Status\n",
				`## Status\nDiscipline Score: ${updated}\n`,
			);
		}
		await saveDailyLog(userId, today, log);
	} catch (err) {
		console.error("[Mirror Score to Daily Log Error]:", err);
	}

	return updated;
}

// @lat: [[memory#Upstash Redis Store]]
export async function checkAndMarkEventProcessed(
	eventId: string,
): Promise<boolean> {
	const url = process.env.UPSTASH_REDIS_REST_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN;
	if (url && token && url !== "your_upstash_redis_rest_url_here") {
		const redis = new Redis({ url, token });
		try {
			const result = await redis.set(`event:${eventId}:processed`, "true", {
				nx: true,
				ex: 300,
			});
			return result === null || result === undefined; // If null, it means nx condition failed (already exists)
		} catch (err) {
			console.error("[Redis Idempotency Error]:", err);
		}
	}
	return false;
}
