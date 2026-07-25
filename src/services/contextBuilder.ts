import { getDisciplineScore } from "./memory/fsmStore.js";
import { readUserProfile } from "./memory/profileStore.js";
import {
	MASTER_SYSTEM_PROMPT,
	SUB_PROMPT_EVENING,
	SUB_PROMPT_MORNING,
	SUB_PROMPT_PROGRESS,
} from "./spartanPrompts.js";

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
	state: "MORNING" | "PROGRESS" | "EVENING",
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

	// Append modular sub-prompt based on context
	let subPrompt = "";
	if (state === "MORNING") {
		subPrompt = SUB_PROMPT_MORNING;
	} else if (state === "PROGRESS") {
		subPrompt = SUB_PROMPT_PROGRESS;
	} else if (state === "EVENING") {
		subPrompt = SUB_PROMPT_EVENING;
	}

	// Inject current Google Tasks list when available
	let taskContext = "";
	if (googleTasks && googleTasks.length > 0) {
		const formatted = googleTasks
			.map((t, i) => `[${i + 1}] ${t.title}`)
			.join("\n");
		taskContext = `\n\n# Current Google Tasks\n${formatted}`;
	}

	return `${prompt}${taskContext}\n\n---\n\n${subPrompt}`;
}
