import fs from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");
const IS_VERCEL = !!process.env.VERCEL;
const DAILY_DIR = IS_VERCEL
  ? path.resolve("/tmp", "daily")
  : path.resolve(MEMORY_DIR, "daily");

// Upstash Redis クライアントの動的初期化
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

export async function readUserProfile(): Promise<string> {
	try {
		const filePath = path.join(MEMORY_DIR, "USER_PROFILE.md");
		return await fs.readFile(filePath, "utf-8");
	} catch {
		try {
			const samplePath = path.join(MEMORY_DIR, "USER_PROFILE.sample.md");
			return await fs.readFile(samplePath, "utf-8");
		} catch {
			return "名前: ユーザー";
		}
	}
}

export async function readPatterns(): Promise<string> {
	try {
		const filePath = path.join(MEMORY_DIR, "patterns.md");
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return "HP 3: 通常運転";
	}
}

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
			if (type === "accountability") return "目標と実際の行動の差分を分析してください。";
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

export async function readDailyLog(dateStr: string): Promise<string> {
	const redis = getRedisClient();
	if (redis) {
		try {
			const data = await redis.get<string>(`daily:${dateStr}`);
			if (data) return data;
		} catch (err: unknown) {
			console.error("[Redis Read Error]:", err);
		}
	}

	try {
		const filePath = path.join(DAILY_DIR, `${dateStr}.md`);
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return `# ${dateStr}\n\n## Status\nHP: 3\n\n## Morning Sent\n\n## Raw Logs\n\n## Evening Sent\n`;
	}
}

export async function saveDailyLog(dateStr: string, content: string): Promise<void> {
	const redis = getRedisClient();
	if (redis) {
		try {
			await redis.set(`daily:${dateStr}`, content);
		} catch (err: unknown) {
			console.error("[Redis Write Error]:", err);
		}
	}

	try {
		await ensureDirectoryExists(DAILY_DIR);
		const filePath = path.join(DAILY_DIR, `${dateStr}.md`);
		await fs.writeFile(filePath, content, "utf-8");
	} catch (_err) {
		// Ignore local write errors in Vercel if Redis succeeds
	}
}

export async function getRecentLogs(days: number = 3): Promise<string[]> {
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
		const log = await readDailyLog(dateStr);
		logs.push(log);
	}

	return logs;
}

export async function resolveCurrentHp(recentLogs: string[]): Promise<number> {
	for (const log of recentLogs) {
		const match = log.match(/HP:\s*(\d)/i);
		if (match?.[1]) {
			return Number(match[1]);
		}
	}
	return 3;
}

export async function appendPlannedTask(dateStr: string, taskText: string) {
	let content = await readDailyLog(dateStr);

	const taskLine = `- [ ] ${taskText.trim()}\n`;

	if (content.includes("## Planned Tasks")) {
		content = content.replace("## Planned Tasks\n", `## Planned Tasks\n${taskLine}`);
	} else {
		content += `\n## Planned Tasks\n${taskLine}`;
	}

	await saveDailyLog(dateStr, content);
}

export async function appendRawUserLog(dateStr: string, text: string) {
	let content = await readDailyLog(dateStr);

	const timeStr = new Date().toLocaleTimeString("ja-JP", {
		timeZone: "Asia/Tokyo",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});

	// 「タスク:」または「タスク：」で始まるか判定（全角・半角スペース両対応）
	const taskMatch = text.match(/^タスク[:：]\s*(.+)$/s);

	if (taskMatch?.[1]) {
		const taskBody = taskMatch[1].trim();
		await appendPlannedTask(dateStr, taskBody);
	}

	const logLine = `- ${timeStr} USER: ${text.replace(/\n/g, " ")}\n`;

	if (content.includes("## Raw Logs")) {
		content = content.replace("## Raw Logs\n", `## Raw Logs\n${logLine}`);
	} else {
		content += `\n## Raw Logs\n${logLine}`;
	}

	// HP指定を含む発言があった場合、Statusも更新
	const hpMatch = text.match(/HP[:：\s]*([1-5])/i);
	if (hpMatch?.[1]) {
		const newHp = hpMatch[1];
		if (content.includes("HP:")) {
			content = content.replace(/HP:\s*\d/, `HP: ${newHp}`);
		}
	}

	await saveDailyLog(dateStr, content);
}

export async function carryOverPendingTasks(yesterdayDateStr: string, todayDateStr: string): Promise<number> {
	const yesterdayLog = await readDailyLog(yesterdayDateStr);
	if (!yesterdayLog.includes("## Planned Tasks")) {
		return 0;
	}

	// 前日の ## Planned Tasks セクションから未完了タスク（- [ ] ）を抽出
	const tasksSectionMatch = yesterdayLog.match(/## Planned Tasks\n([\s\S]*?)(?=\n## |$)/);
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

	let todayLog = await readDailyLog(todayDateStr);
	let carriedCount = 0;

	for (const taskName of pendingTasks) {
		// 当日ログに既に同名のタスクが存在するかチェック
		if (!todayLog.includes(taskName)) {
			const carriedTaskLine = `- [ ] ${taskName} (carried)\n`;
			if (todayLog.includes("## Planned Tasks")) {
				todayLog = todayLog.replace("## Planned Tasks\n", `## Planned Tasks\n${carriedTaskLine}`);
			} else {
				todayLog += `\n## Planned Tasks\n${carriedTaskLine}`;
			}
			carriedCount++;
		}
	}

	if (carriedCount > 0) {
		await saveDailyLog(todayDateStr, todayLog);
	}

	return carriedCount;
}

export type CompleteTaskResult =
	| { status: "success"; taskText: string }
	| { status: "not_found" }
	| { status: "multiple"; matches: string[] };

export async function markTaskAsCompleted(
	todayDateStr: string,
	queryText: string
): Promise<CompleteTaskResult> {
	const todayLog = await readDailyLog(todayDateStr);
	if (!todayLog.includes("## Planned Tasks")) {
		return { status: "not_found" };
	}

	const tasksSectionMatch = todayLog.match(/## Planned Tasks\n([\s\S]*?)(?=\n## |$)/);
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
		new RegExp(`-\\s*\\[\\s*\\]\\s*${targetTask.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
		`- [x] ${targetTask}`
	);

	await saveDailyLog(todayDateStr, updatedLog);
	return { status: "success", taskText: targetTask };
}

export async function appendSentMessage(
	dateStr: string,
	type: "Morning" | "Evening",
	text: string,
) {
	let content = await readDailyLog(dateStr);

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

	await saveDailyLog(dateStr, content);
}
