import {
	getDisciplineScore,
	readPromptTemplate,
	readUserProfile,
} from "./memoryStore.js";
import {
	MASTER_SYSTEM_PROMPT,
	SUB_PROMPT_MORNING,
	SUB_PROMPT_PENALTY,
	SUB_PROMPT_PROOF,
	SUB_PROMPT_SCHEDULED,
} from "./spartanPrompts.js";

// @lat: [[llm#State-Adaptive Prompting]]
export async function buildSpartanPrompt(
	userId: string,
	state:
		| "IDLE"
		| "PENDING"
		| "SCHEDULED"
		| "EXECUTING"
		| "REPORTING"
		| "ESCAPED",
	metadata?: {
		taskText?: string;
		targetStartTime?: string;
		targetDuration?: number;
		proofDefinition?: string;
	},
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

	// Build the master prompt with variables
	const prompt = MASTER_SYSTEM_PROMPT.replace("{{USER_NAME}}", userName)
		.replace("{{PRIMARY_GOAL}}", primaryGoal)
		.replace("{{DISCIPLINE_SCORE}}", String(score))
		.replace("{{STAKED_COMMITMENT_DETAILS}}", stakedDetails)
		.replace("{{TODAY_TASK}}", metadata?.taskText || "未設定")
		.replace("{{TARGET_TIME}}", metadata?.targetStartTime || "未設定");

	// Append modular sub-prompt
	let subPrompt = "";
	if (state === "IDLE" || state === "PENDING") {
		subPrompt = SUB_PROMPT_MORNING;
	} else if (state === "SCHEDULED" || state === "EXECUTING") {
		subPrompt = SUB_PROMPT_SCHEDULED;
	} else if (state === "REPORTING") {
		subPrompt = SUB_PROMPT_PROOF;
	} else if (state === "ESCAPED") {
		subPrompt = SUB_PROMPT_PENALTY;
	}

	// Replace sub-prompt variables
	subPrompt = subPrompt
		.replace("{{TARGET_TIME}}", metadata?.targetStartTime || "未設定")
		.replace("{{TODAY_TASK}}", metadata?.taskText || "未設定");

	return `${prompt}\n\n---\n\n${subPrompt}`;
}

export async function buildMorningPrompt(
	profile: string,
	patterns: string,
	recentLogs: string[],
	currentHp: number,
): Promise<string> {
	const template = await readPromptTemplate("morning");
	const logsText = recentLogs.join("\n\n---\n\n");

	return template
		.replace("{USER_PROFILE}", profile)
		.replace("{PATTERNS}", patterns)
		.replace("{RECENT_LOGS}", logsText)
		.replace("{CURRENT_HP}", String(currentHp));
}

export async function buildEveningPrompt(
	profile: string,
	patterns: string,
	todayLog: string,
): Promise<string> {
	const template = await readPromptTemplate("evening");

	return template
		.replace("{USER_PROFILE}", profile)
		.replace("{PATTERNS}", patterns)
		.replace("{TODAY_LOG}", todayLog);
}

export async function buildAccountabilityPrompt(
	profile: string,
	patterns: string,
	statedGoals: string,
	plannedTasks: string,
	actualActions: string,
	currentHp: number,
): Promise<string> {
	const template = await readPromptTemplate("accountability");

	return template
		.replace("{USER_PROFILE}", profile)
		.replace("{PATTERNS}", patterns)
		.replace("{STATED_GOALS}", statedGoals || "(明記された長期目標なし)")
		.replace("{PLANNED_TASKS}", plannedTasks || "(予定タスクなし)")
		.replace("{ACTUAL_ACTIONS}", actualActions || "(記録された行動なし)")
		.replace("{CURRENT_HP}", String(currentHp));
}

export async function buildTaskPlanningPrompt(
	profile: string,
	patterns: string,
	todayTasks: string,
	availableTime: string,
	currentHp: number,
): Promise<string> {
	const template = await readPromptTemplate("task_planning");

	return template
		.replace("{USER_PROFILE}", profile)
		.replace("{PATTERNS}", patterns)
		.replace("{TODAY_TASKS}", todayTasks || "(未整理のタスクなし)")
		.replace("{AVAILABLE_TIME}", availableTime || "指定なし")
		.replace("{CURRENT_HP}", String(currentHp));
}
