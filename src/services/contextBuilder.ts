import { readPromptTemplate } from "./memoryStore.js";

export async function buildMorningPrompt(
  profile: string,
  patterns: string,
  recentLogs: string[],
  currentHp: number
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
  todayLog: string
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
  currentHp: number
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
  currentHp: number
): Promise<string> {
  const template = await readPromptTemplate("task_planning");

  return template
    .replace("{USER_PROFILE}", profile)
    .replace("{PATTERNS}", patterns)
    .replace("{TODAY_TASKS}", todayTasks || "(未整理のタスクなし)")
    .replace("{AVAILABLE_TIME}", availableTime || "指定なし")
    .replace("{CURRENT_HP}", String(currentHp));
}
