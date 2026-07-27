import { getTodayDateString, readDailyLog } from "../../shared/memory/dailyLogStore.js";
import { getDisciplineScore } from "../../shared/memory/fsmStore.js";
import { readPromptTemplate, readUserProfile } from "../../shared/memory/profileStore.js";
import { MASTER_SYSTEM_PROMPT, SUB_PROMPT_MORNING } from "./spartanPrompts.js";

// Pure helper function for template variable interpolation
export function formatTemplate(
	template: string,
	variables: Record<string, string | number>,
): string {
	return Object.entries(variables).reduce(
		(str, [key, val]) => str.replaceAll(`{${key}}`, String(val)),
		template,
	);
}

// @lat: [[llm#State-Adaptive Prompting]]
export async function buildSpartanPrompt(
	userId: string,
	state: "MORNING" | "EVENING" | "PROGRESS",
	googleTasks?: { id: string; title: string }[],
): Promise<string> {
	const profile = await readUserProfile(userId);
	const score = await getDisciplineScore(userId);

	// Extract name and goal from profile
	const nameMatch = profile.match(/(?:名前|名前:)[:：\s]*(.+)/i);
	const userName = nameMatch?.[1]?.trim() || "ユーザー";

	const goalMatch = profile.match(/(?:目標|目標:)[:：\s]*(.+)/i);
	const primaryGoal = goalMatch?.[1]?.trim() || "自己規律の確立";

	const stakedMatch = profile.match(/(?:誓約|ペナルティ|Staked)[:：\s]*(.+)/i);
	const stakedDetails = stakedMatch?.[1]?.trim() || "未設定（自己評価のみ）";

	// Build master prompt
	const prompt = MASTER_SYSTEM_PROMPT.replace("{{USER_NAME}}", userName)
		.replace("{{PRIMARY_GOAL}}", primaryGoal)
		.replace("{{DISCIPLINE_SCORE}}", String(score))
		.replace("{{STAKED_COMMITMENT_DETAILS}}", stakedDetails);

	// Append modular sub-prompt based on context.
	// Evening uses the local .md template (memory/prompt_evening.md) so it can be
	// edited without redeploy; falls back to the bundled constant if the file is
	// missing.
	let subPrompt = "";
	if (state === "MORNING") {
		subPrompt = SUB_PROMPT_MORNING;
	} else if (state === "EVENING") {
		subPrompt = await readPromptTemplate("evening");
	} else if (state === "PROGRESS") {
		subPrompt = await readPromptTemplate("progress");
	}

	// Inject current Google Tasks list when available
	let taskContext = "";
	if (googleTasks && googleTasks.length > 0) {
		const formatted = googleTasks
			.map((t, i) => `[${i + 1}] ${t.title}`)
			.join("\n");
		taskContext = `\n\n# Current Google Tasks\n${formatted}`;
	} else {
		taskContext =
			"\n\n# Current Google Tasks\n(現在登録されたタスクはありません)";
	}

	// For the evening review, also inject the day's action log so the summary
	// can react to each entry instead of being an empty recap.
	let logContext = "";
	if (state === "EVENING") {
		const todayLog = await readDailyLog(userId, getTodayDateString());
		logContext = `\n\n# Today's Action Log\n${todayLog}`;
	}

	return `${prompt}${taskContext}${logContext}\n\n---\n\n${subPrompt}`;
}
