import { Hono } from "hono";
import { generateMessage } from "../../shared/llm.js";
import {
	getUserState,
	setUserState,
	updateDisciplineScore,
} from "../../shared/memory/fsmStore.js";
import { buildSpartanPrompt } from "../spartan-context/contextBuilder.js";
import { buildProgressMessage } from "../spartan-context/progressMessage.js";
import {
	arraysDiffer,
	computeDisciplineDelta,
	computeRecentReply,
	createLinePushClient,
	fetchGoogleTasksWithIds,
	handleCronRoute,
	type PushClient,
	sendAndRecordPush,
	shouldSendNoResponseNudge,
} from "./helper.js";

type Env = { Variables: { pushClient: PushClient } };

// @lat: [[routing#Cron Trigger Routing]]
const cronApp = new Hono<Env>();

// 認証ミドルウェア + 依存性注入 (PushClient)
cronApp.use("*", async (c, next) => {
	const secret = process.env.CRON_SECRET;
	const authHeader = c.req.header("Authorization");

	if (secret && authHeader !== `Bearer ${secret}`) {
		return c.text("Unauthorized", 401);
	}

	// Hono Context に pushClient をセット（テスト時にオーバーライド可能）
	if (!c.var.pushClient) {
		c.set(
			"pushClient",
			createLinePushClient(process.env.LINE_CHANNEL_ACCESS_TOKEN),
		);
	}

	await next();
});

const getUserId = (): string => process.env.LINE_USER_ID || "default_user";
const NO_RESPONSE_NUDGE =
	"今日の一歩は、小さくて大丈夫です。できそうなことを1つだけ試してみましょう。";

// 朝の Cron (/cron/morning) - 毎朝07:00に発動
cronApp.get("/morning", async (c) => {
	const pushClient = c.get("pushClient");
	const result = await handleCronRoute("Morning", async () => {
		const userId = getUserId();
		const { tasks: googleTasks, taskIds } =
			await fetchGoogleTasksWithIds(userId);

		await setUserState(userId, "ACTIVE", {
			taskSnapshot: taskIds,
			tasksChangedToday: false,
			repliedToday: false,
			lastProgressPushAt: new Date().toISOString(),
			currentTaskSnapshot: taskIds,
		});

		const prompt = await buildSpartanPrompt(userId, "MORNING", googleTasks);
		const morningMsg = await generateMessage(prompt);

		await sendAndRecordPush(pushClient, userId, "Morning", morningMsg);

		return {
			type: "morning",
			message: morningMsg,
			googleTasksCount: googleTasks.length,
		};
	});

	return result.success ? c.json(result) : c.json(result, 500);
});

// 60分おき進捗確認 Cron (/cron/progress) - 0 7-22 * * * で発動
cronApp.get("/progress", async (c) => {
	const pushClient = c.get("pushClient");
	const result = await handleCronRoute("Progress", async () => {
		const userId = getUserId();
		const stateData = await getUserState(userId);

		const { tasks: googleTasks, taskIds: currentIds } =
			await fetchGoogleTasksWithIds(userId);
		const metadata = stateData.metadata;
		const shouldNudge = shouldSendNoResponseNudge(
			metadata?.lastUserReplyAt,
			metadata?.lastNudgeAt,
		);

		// IDLEでも4時間以上無応答ならnudgeを許可する。
		if (stateData.state !== "ACTIVE" && !shouldNudge) {
			return {
				state: stateData.state,
				msg: "Inactive (LINE unchecked). Skipping progress push.",
			};
		}

		const snapshot =
			stateData.metadata?.currentTaskSnapshot ||
			stateData.metadata?.taskSnapshot ||
			[];
		const tasksChanged = arraysDiffer(snapshot, currentIds);

		const recentReply = computeRecentReply(
			stateData.metadata?.lastUserReplyAt,
			stateData.metadata?.lastProgressPushAt,
		);

		const shouldPush = recentReply || tasksChanged || shouldNudge;
		let progressMsg = "";

		if (shouldPush) {
			progressMsg = shouldNudge
				? NO_RESPONSE_NUDGE
				: buildProgressMessage(googleTasks);
			await sendAndRecordPush(pushClient, userId, "Progress", progressMsg);
		}

		const nextActive = shouldPush;
		await setUserState(userId, nextActive ? "ACTIVE" : "IDLE", {
			...stateData.metadata,
			tasksChangedToday: stateData.metadata?.tasksChangedToday || tasksChanged,
			currentTaskSnapshot: currentIds,
			lastProgressPushAt: new Date().toISOString(),
			...(shouldNudge ? { lastNudgeAt: new Date().toISOString() } : {}),
		});

		return {
			type: "progress",
			pushed: shouldPush,
			message: progressMsg,
			nextState: nextActive ? "ACTIVE" : "IDLE",
			recentReply,
			tasksChanged,
			shouldNudge,
		};
	});

	return result.success ? c.json(result) : c.json(result, 500);
});

// 夜の Cron (/cron/evening) - 毎夜22:00に発動
cronApp.get("/evening", async (c) => {
	const pushClient = c.get("pushClient");
	const result = await handleCronRoute("Evening", async () => {
		const userId = getUserId();
		const stateData = await getUserState(userId);

		const tasksChanged = stateData.metadata?.tasksChangedToday || false;
		const replied = stateData.metadata?.repliedToday || false;

		const delta = computeDisciplineDelta(tasksChanged, replied);
		if (delta !== 0) {
			await updateDisciplineScore(userId, delta);
		}
		await setUserState(userId, "IDLE"); // 翌日のリセット

		const { tasks: googleTasks } = await fetchGoogleTasksWithIds(userId);
		const prompt = await buildSpartanPrompt(userId, "EVENING", googleTasks);
		const eveningMsg = await generateMessage(prompt);

		await sendAndRecordPush(pushClient, userId, "Evening", eveningMsg);

		return { type: "evening", message: eveningMsg, delta };
	});

	return result.success ? c.json(result) : c.json(result, 500);
});

export default cronApp;
