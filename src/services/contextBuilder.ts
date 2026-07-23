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
