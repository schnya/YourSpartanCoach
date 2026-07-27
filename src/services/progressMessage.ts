// Fixed, LLM-free progress check-in message.
// Mirrors the auto-reply style of messageHandlers ("記録したよ👍"): a static
// message that simply lists the user's current Google Tasks, with no model call.
// Replaces the previous buildSpartanPrompt("PROGRESS") + generateMessage() path.

export function buildProgressMessage(
	tasks: { id: string; title: string }[],
): string {
	if (!tasks || tasks.length === 0) {
		return "現在登録されてるタスクはないで。新しいタスクをGoogle Tasksに入れるか、そのまま何か送って記録してな。";
	}

	const lines = tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
	return `【現在のタスク一覧】
${lines}

これらを片付けていこ。進捗あれば送って😘`;
}
