// Fixed, LLM-free progress check-in message.
// Mirrors the auto-reply style of messageHandlers ("記録したよ👍"): a static
// message that simply lists the user's current Google Tasks, with no model call.
// Replaces the previous buildSpartanPrompt("PROGRESS") + generateMessage() path.

export function buildProgressMessage(
	tasks: { id: string; title: string }[],
): string {
	// 🚶‍♂️ 「立つ・動く」の文言バリエーション
	const standNudges = [
		"🚶‍♂️ 2分だけ立とう！座りっぱなしは運動してても危険⚠️",
		"🏃‍♂️ 立ち上がってストレッチ！血糖値と代謝をリセット🔄",
		"🦵 ずっと座ってない？立つだけで脂質代謝UP！",
		"🧍‍♂️ 一旦立って背伸び！長時間座位のリスクを断ち切ろう💪",
	];

	// 🥛 「水分補給」の文言バリエーション
	const drinkNudges = [
		"🥛 なんとなくだるい・イライラ…実は水分不足かも？水飲もう",
		"🍵 喉が渇く前に一口！水分補給で気分をリフレッシュ✨",
		"💧 コップ半分の水分補給で疲労感を撃退しよう！",
		"☕️ 水やお茶を一口飲んで、認知パフォーマンスをキープ！",
	];

	// それぞれからランダムで1つずつ抽出してセットにする
	const standMsg = standNudges[Math.floor(Math.random() * standNudges.length)];
	const drinkMsg = drinkNudges[Math.floor(Math.random() * drinkNudges.length)];
	const nudgeBlock = `💡 Today's Health Check:\n${standMsg}\n${drinkMsg}`;

	if (!tasks || tasks.length === 0) {
		return `現在登録されてるタスクはないで。新しいタスクをGoogle Tasksに入れるか、そのまま何か送って記録してな。\n\n${nudgeBlock}`;
	}

	const lines = tasks.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
	return `【現在のタスク一覧】
${lines}

これらを片付けていこ。進捗あれば送って😘

${nudgeBlock}`;
}
