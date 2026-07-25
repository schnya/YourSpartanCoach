import { getDisciplineScore } from "./memory/fsmStore.js";
import { readPromptTemplate, readUserProfile } from "./memory/profileStore.js";
import {
	MASTER_SYSTEM_PROMPT,
	SUB_PROMPT_MORNING,
	SUB_PROMPT_PENALTY,
	SUB_PROMPT_PROOF,
	SUB_PROMPT_SCHEDULED,
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

export interface MorningPromptOptions {
	profile: string;
	patterns: string;
	recentLogs: string[];
	currentHp: number;
}

export interface EveningPromptOptions {
	profile: string;
	patterns: string;
	todayLog: string;
}

export interface AccountabilityPromptOptions {
	profile: string;
	patterns: string;
	statedGoals?: string;
	plannedTasks?: string;
	actualActions?: string;
	currentHp: number;
}

export interface TaskPlanningPromptOptions {
	profile: string;
	patterns: string;
	todayTasks?: string;
	availableTime?: string;
	currentHp: number;
}

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

	// Build master prompt
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

	subPrompt = subPrompt
		.replace("{{TARGET_TIME}}", metadata?.targetStartTime || "未設定")
		.replace("{{TODAY_TASK}}", metadata?.taskText || "未設定");

	return `${prompt}\n\n---\n\n${subPrompt}`;
}

export async function buildMorningPrompt(
	options: MorningPromptOptions,
): Promise<string> {
	const template = await readPromptTemplate("morning");
	return formatTemplate(template, {
		USER_PROFILE: options.profile,
		PATTERNS: options.patterns,
		RECENT_LOGS: options.recentLogs.join("\n\n---\n\n"),
		CURRENT_HP: options.currentHp,
	});
}

export async function buildEveningPrompt(
	options: EveningPromptOptions,
): Promise<string> {
	const template = await readPromptTemplate("evening");
	return formatTemplate(template, {
		USER_PROFILE: options.profile,
		PATTERNS: options.patterns,
		TODAY_LOG: options.todayLog,
	});
}

export async function buildAccountabilityPrompt(
	options: AccountabilityPromptOptions,
): Promise<string> {
	const template = await readPromptTemplate("accountability");
	return formatTemplate(template, {
		USER_PROFILE: options.profile,
		PATTERNS: options.patterns,
		STATED_GOALS: options.statedGoals || "(明記された長期目標なし)",
		PLANNED_TASKS: options.plannedTasks || "(予定タスクなし)",
		ACTUAL_ACTIONS: options.actualActions || "(記録された行動なし)",
		CURRENT_HP: options.currentHp,
	});
}

export async function buildTaskPlanningPrompt(
	options: TaskPlanningPromptOptions,
): Promise<string> {
	const template = await readPromptTemplate("task_planning");
	return formatTemplate(template, {
		USER_PROFILE: options.profile,
		PATTERNS: options.patterns,
		TODAY_TASKS: options.todayTasks || "(未整理のタスクなし)",
		AVAILABLE_TIME: options.availableTime || "指定なし",
		CURRENT_HP: options.currentHp,
	});
}
