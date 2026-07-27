import { messagingApi } from "@line/bot-sdk";
import { Hono } from "hono";
import { listGoogleTasks } from "../../shared/integrations/google-tasks/googleTasks.js";
import { generateMessage } from "../../shared/llm.js";
import {
	appendSentMessage,
	getTodayDateString,
} from "../../shared/memory/dailyLogStore.js";
import {
	getUserState,
	setUserState,
	updateDisciplineScore,
} from "../../shared/memory/fsmStore.js";
import { buildSpartanPrompt } from "../spartan-context/contextBuilder.js";
import { buildProgressMessage } from "../spartan-context/progressMessage.js";

// @lat: [[routing#Cron Trigger Routing]]
const cronApp = new Hono();

// オプションの CRON_SECRET 認証ミドルウェア
cronApp.use("*", async (c, next) => {
	const secret = process.env.CRON_SECRET;
	if (secret) {
		const authHeader = c.req.header("Authorization");
		if (authHeader !== `Bearer ${secret}`) {
			return c.text("Unauthorized", 401);
		}
	}
	await next();
});

async function sendPushMessage(userId: string, text: string) {
	const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

	if (!channelAccessToken || !userId || userId === "your_line_user_id_here") {
		console.warn(
			"[Push Message Mock]: LINE credentials missing or default. Outputting to console:",
		);
		console.log(`>>> USER[${userId}]: ${text}`);
		return;
	}

	const client = new messagingApi.MessagingApiClient({ channelAccessToken });

	try {
		await client.pushMessage({
			to: userId,
			messages: [{ type: "text", text }],
		});
		console.log(`[Push Message Success]: Sent to user=${userId}`);
	} catch (err: unknown) {
		const errorDetail = err instanceof Error ? err.message : String(err);
		console.error(
			`[LINE Push Message Error Detail for user=${userId}]:`,
			errorDetail,
		);
	}
}

function arraysDiffer(a: string[] = [], b: string[] = []): boolean {
	if (a.length !== b.length) return true;
	const setB = new Set(b);
	return a.some((x) => !setB.has(x));
}

// 朝の Cron (/cron/morning) - 毎朝07:00に発動
// 承認フェーズなし: Google Tasks から当日タスクを取得し、AIが優先度付け＋
// 行動経済学的意見を添えて push。その後 ACTIVE ループを開始。
cronApp.get("/morning", async (c) => {
	try {
		const userId = process.env.LINE_USER_ID || "default_user";

		const googleTasks = await listGoogleTasks();
		const taskIds = googleTasks.map((t) => t.id).filter(Boolean) as string[];

		// スナップショット保存 + 日次フラグリセット + ACTIVE化
		await setUserState(userId, "ACTIVE", {
			taskSnapshot: taskIds,
			tasksChangedToday: false,
			repliedToday: false,
			lastProgressPushAt: new Date().toISOString(),
			currentTaskSnapshot: taskIds,
		});

		const prompt = await buildSpartanPrompt(userId, "MORNING", googleTasks);
		const morningMsg = await generateMessage(prompt);

		await appendSentMessage(
			userId,
			getTodayDateString(),
			"Morning",
			morningMsg,
		);
		await sendPushMessage(userId, morningMsg);

		return c.json({
			success: true,
			type: "morning",
			message: morningMsg,
			googleTasksCount: googleTasks.length,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[Cron Morning Error]:", message);
		return c.json({ success: false, error: message }, 500);
	}
});

// 50分おき進捗確認 Cron (/cron/progress) - */50 * * * * で発動
// ACTIVE なら進捗メッセージを push。直近50分で返信もタスク増減もなければ
// IDLE（LINE未確認ステータス）に切り替え、以降は push を停止する。
cronApp.get("/progress", async (c) => {
	try {
		const userId = process.env.LINE_USER_ID || "default_user";
		const stateData = await getUserState(userId);

		// IDLE（未確認中）: push せず、webhook で復帰されるまで待機
		if (stateData.state !== "ACTIVE") {
			return c.json({
				success: true,
				state: stateData.state,
				msg: "Inactive (LINE unchecked). Skipping progress push.",
			});
		}

		const googleTasks = await listGoogleTasks();
		const currentIds = googleTasks.map((t) => t.id).filter(Boolean) as string[];
		const snapshot = stateData.metadata?.taskSnapshot || [];

		// タスクの増減（新規追加＋完了）を検知
		const tasksChanged = arraysDiffer(snapshot, currentIds);
		if (tasksChanged) {
			await setUserState(userId, "ACTIVE", {
				...stateData.metadata,
				tasksChangedToday: true,
				currentTaskSnapshot: currentIds,
			});
		}

		// 直近50分のユーザー返信を判定（前回push以降に返信があれば recentReply=true）
		const lastReply = stateData.metadata?.lastUserReplyAt
			? new Date(stateData.metadata.lastUserReplyAt)
			: null;
		const lastPush = stateData.metadata?.lastProgressPushAt
			? new Date(stateData.metadata.lastProgressPushAt)
			: null;
		const recentReply = !!lastReply && !!lastPush && lastReply > lastPush;

		// 固定メッセージ（LLM不使用）: 現在のタスク一覧をそのまま提示する。
		const progressMsg = buildProgressMessage(googleTasks);

		await appendSentMessage(
			userId,
			getTodayDateString(),
			"Progress",
			progressMsg,
		);
		await sendPushMessage(userId, progressMsg);

		// 次回判定用に push 時刻を更新。返信も増減もなければ IDLE 化。
		const nextActive = recentReply || tasksChanged;
		await setUserState(userId, nextActive ? "ACTIVE" : "IDLE", {
			...stateData.metadata,
			tasksChangedToday: stateData.metadata?.tasksChangedToday || tasksChanged,
			currentTaskSnapshot: currentIds,
			lastProgressPushAt: new Date().toISOString(),
		});

		return c.json({
			success: true,
			type: "progress",
			message: progressMsg,
			nextState: nextActive ? "ACTIVE" : "IDLE",
			recentReply,
			tasksChanged,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[Cron Progress Error]:", message);
		return c.json({ success: false, error: message }, 500);
	}
});

// 夜の Cron (/cron/evening) - 毎夜22:00に発動
// 日中のタスク増減とLINE返信の有無で加点/減点を判定し、スコアに基づくトーンで総括を LLM 生成して push。
cronApp.get("/evening", async (c) => {
	try {
		const userId = process.env.LINE_USER_ID || "default_user";
		const today = getTodayDateString();
		const stateData = await getUserState(userId);

		const tasksChanged = stateData.metadata?.tasksChangedToday || false;
		const replied = stateData.metadata?.repliedToday || false;

		let delta = 0;
		if (tasksChanged && replied) delta = 5;
		else if (!tasksChanged && !replied) delta = -5;

		if (delta !== 0) {
			await updateDisciplineScore(userId, delta);
		}
		await setUserState(userId, "IDLE"); // 翌日のリセット

		const googleTasks = await listGoogleTasks();
		const prompt = await buildSpartanPrompt(userId, "EVENING", googleTasks);
		const eveningMsg = await generateMessage(prompt);

		await appendSentMessage(userId, today, "Evening", eveningMsg);
		await sendPushMessage(userId, eveningMsg);

		return c.json({
			success: true,
			type: "evening",
			message: eveningMsg,
			delta,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[Cron Evening Error]:", message);
		return c.json({ success: false, error: message }, 500);
	}
});

export default cronApp;
