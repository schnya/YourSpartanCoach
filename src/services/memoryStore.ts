import fs from "node:fs/promises";
import path from "node:path";

const MEMORY_DIR = path.resolve(process.cwd(), "memory");
// Vercel などのサーバーレス環境では /tmp のみ書き込み可能
const IS_VERCEL = !!process.env.VERCEL;
const DAILY_DIR = IS_VERCEL
  ? path.resolve("/tmp", "daily")
  : path.resolve(MEMORY_DIR, "daily");

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
	type: "morning" | "evening",
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
			return type === "morning"
				? "朝のメッセージを生成してください。"
				: "夜のメッセージを生成してください。";
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
	try {
		const filePath = path.join(DAILY_DIR, `${dateStr}.md`);
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return `# ${dateStr}\n\n## Status\nHP: 3\n\n## Morning Sent\n\n## Raw Logs\n\n## Evening Sent\n`;
	}
}

export async function getRecentLogs(days: number = 3): Promise<string[]> {
	await ensureDirectoryExists(DAILY_DIR);
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

export async function appendRawUserLog(dateStr: string, text: string) {
	await ensureDirectoryExists(DAILY_DIR);
	const filePath = path.join(DAILY_DIR, `${dateStr}.md`);
	let content = await readDailyLog(dateStr);

	const timeStr = new Date().toLocaleTimeString("ja-JP", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const logLine = `- ${timeStr} USER: ${text.replace(/\n/g, " ")}\n`;

	if (content.includes("## Raw Logs")) {
		content = content.replace("## Raw Logs\n", `## Raw Logs\n${logLine}`);
	} else {
		content += `\n## Raw Logs\n${logLine}`;
	}

	// HP指定を含む発言（例：「HP: 2」や「HP2」）があった場合、Statusも更新
	const hpMatch = text.match(/HP[:：\s]*([1-5])/i);
	if (hpMatch?.[1]) {
		const newHp = hpMatch[1];
		if (content.includes("HP:")) {
			content = content.replace(/HP:\s*\d/, `HP: ${newHp}`);
		}
	}

	await fs.writeFile(filePath, content, "utf-8");
}

export async function appendSentMessage(
	dateStr: string,
	type: "Morning" | "Evening",
	text: string,
) {
	await ensureDirectoryExists(DAILY_DIR);
	const filePath = path.join(DAILY_DIR, `${dateStr}.md`);
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

	await fs.writeFile(filePath, content, "utf-8");
}
