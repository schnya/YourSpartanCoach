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
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
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
		const dateStr = targetDate.toISOString().split("T")[0];
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

export async function appendSentMessage(
	dateStr: string,
	type: "Morning" | "Evening",
	text: string,
) {
	let content = await readDailyLog(dateStr);

	const timeStr = new Date().toLocaleTimeString("ja-JP", {
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
