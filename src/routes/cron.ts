import { messagingApi } from "@line/bot-sdk";
import { Hono } from "hono";
import { buildSpartanPrompt } from "../services/contextBuilder.js";
import { generateMessage } from "../services/llm.js";
import {
	appendSentMessage,
	carryOverPendingTasks,
	checkAndMarkEventProcessed,
	getDisciplineScore,
	getTodayDateString,
	getUserState,
	setUserState,
	updateDisciplineScore,
} from "../services/memoryStore.js";

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

// 朝の Cron (/cron/morning) - 毎朝07:00に発動
cronApp.get("/morning", async (c) => {
	try {
		const userId = process.env.LINE_USER_ID || "default_user";
		const today = getTodayDateString();

		// 1. Carryover tasks
		const now = new Date();
		const yesterdayDate = new Date(now);
		yesterdayDate.setDate(now.getDate() - 1);
		const formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Tokyo",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		const yesterday = formatter.format(yesterdayDate);
		const carriedCount = await carryOverPendingTasks(userId, yesterday, today);

		// 2. Transition state to PENDING
		await setUserState(userId, "PENDING");

		// 3. Build spartan morning prompt
		const prompt = await buildSpartanPrompt(userId, "PENDING");
		const morningMsg = await generateMessage(
			`${prompt}\n\n朝07:00になりました。今日のタスク計画（行動内容、開始時間、所要時間、成果基準）の入力を要求する規律メッセージを出力してください。キャリーオーバーしたタスク件数：${carriedCount}件。`,
		);

		await appendSentMessage(userId, today, "Morning", morningMsg);
		await sendPushMessage(userId, morningMsg);

		return c.json({
			success: true,
			type: "morning",
			message: morningMsg,
			carriedTasks: carriedCount,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[Cron Morning Error]:", message);
		return c.json({ success: false, error: message }, 500);
	}
});

// FSM 監視チェック Cron (/cron/monitor) - 毎分または定期稼働で発動
cronApp.get("/monitor", async (c) => {
	try {
		const userId = process.env.LINE_USER_ID || "default_user";
		const stateData = await getUserState(userId);
		const now = new Date();

		console.log(
			`[FSM Monitor Check]: User=${userId}, State=${stateData.state}`,
		);

		if (
			stateData.state === "SCHEDULED" &&
			stateData.metadata?.targetStartTime
		) {
			const [hours, minutes] = stateData.metadata.targetStartTime
				.split(":")
				.map(Number);
			const targetTime = new Date();
			targetTime.setHours(hours, minutes, 0, 0);

			const limitTime = new Date(targetTime.getTime() + 5 * 60 * 1000); // T + 5min

			if (now > limitTime) {
				console.log(
					`[FSM Delinquent Start Log]: User=${userId} missed start. Non-chase policy: recording silent ESCAPED transition.`,
				);

				// Silent transition to ESCAPED without sending chase LINE push messages
				await setUserState(userId, "ESCAPED", {
					...stateData.metadata,
					silentEscapedReason: "LATE_START",
				});

				return c.json({
					success: true,
					triggered: "late_start_silent",
					msg: "Silent transition executed per Non-Chase policy",
				});
			}
		}

		if (
			stateData.state === "REPORTING" &&
			stateData.metadata?.reportingDeadline
		) {
			const deadline = new Date(stateData.metadata.reportingDeadline);

			if (now > deadline) {
				console.log(
					`[FSM Delinquent Proof Log]: User=${userId} missed proof deadline. Non-chase policy: recording silent ESCAPED transition.`,
				);

				// Silent transition to ESCAPED without sending chase LINE push messages
				await setUserState(userId, "ESCAPED", {
					...stateData.metadata,
					silentEscapedReason: "LATE_PROOF",
				});

				return c.json({
					success: true,
					triggered: "late_proof_silent",
					msg: "Silent transition executed per Non-Chase policy",
				});
			}
		}

		return c.json({
			success: true,
			state: stateData.state,
			msg: "No action needed",
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[Cron Monitor Error]:", message);
		return c.json({ success: false, error: message }, 500);
	}
});

// 夜の Cron (/cron/evening) - 振り返り分析 & 一括査定 (Idempotent)
cronApp.get("/evening", async (c) => {
	try {
		const userId = process.env.LINE_USER_ID || "default_user";
		const today = getTodayDateString();

		// Idempotency check for evening cron execution
		const idempotencyKey = `cron:evening:${today}:${userId}`;
		const isDuplicate = await checkAndMarkEventProcessed(idempotencyKey);
		if (isDuplicate) {
			console.warn(
				`[Cron Evening Warning]: Idempotency check triggered. Already executed for today (${today}).`,
			);
			return c.json({
				success: true,
				duplicate: true,
				msg: "Evening cron already processed for today.",
			});
		}

		// If state is not IDLE at evening, batch penalty processing occurs
		const stateData = await getUserState(userId);
		if (stateData.state !== "IDLE") {
			console.log(
				`[FSM Evening Failure]: User=${userId} was in state ${stateData.state} at night. Applying batch penalty.`,
			);
			await updateDisciplineScore(userId, -10);
			await setUserState(userId, "IDLE"); // Reset state for next day
		}

		const score = await getDisciplineScore(userId);
		const postponeCount = stateData.metadata?.physicalPostponeCount || 0;

		let patternNotice = "";
		if (postponeCount >= 2) {
			patternNotice = `\n【パターン警戒】物理的延期が累計${postponeCount}回記録されています。体調管理の欠陥か、無意識な逃避の自己偽装の疑いがあります。`;
		}

		const eveningMsg = `【夜の総括】本日もお疲れ様でした。
現在の規律スコア: ${score} / 100
物理的延期累計: ${postponeCount}回${patternNotice}
明日も07:00に計画入力を受け付けます。本日の進捗はすべてログに記録されました。明日はさらに高い規律を目指しましょう。`;

		await appendSentMessage(userId, today, "Evening", eveningMsg);
		await sendPushMessage(userId, eveningMsg);

		return c.json({ success: true, type: "evening", message: eveningMsg });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[Cron Evening Error]:", message);
		return c.json({ success: false, error: message }, 500);
	}
});

export default cronApp;
