import { messagingApi } from "@line/bot-sdk";
import {
	listGoogleTasks,
	notifyTokenExpired,
} from "../../shared/integrations/google-tasks/googleTasks.js";
import {
	appendSentMessage,
	getTodayDateString,
} from "../../shared/memory/dailyLogStore.js";

export const extractTaskIds = (
	tasks: Array<{ id?: string | null }>,
): string[] => tasks.map((t) => t.id).filter(Boolean) as string[];

export const arraysDiffer = (a: string[] = [], b: string[] = []): boolean =>
	a.length !== b.length || a.some((x) => !new Set(b).has(x));

export const computeRecentReply = (
	lastUserReplyAt: string | undefined,
	lastProgressPushAt: string | undefined,
): boolean => {
	const lastReply = lastUserReplyAt ? new Date(lastUserReplyAt) : null;
	const lastPush = lastProgressPushAt ? new Date(lastProgressPushAt) : null;
	return !!lastReply && !!lastPush && lastReply > lastPush;
};

export const NUDGE_INTERVAL_MS = 4 * 60 * 60 * 1000;

export const shouldSendNoResponseNudge = (
	lastUserReplyAt: string | undefined,
	lastNudgeAt: string | undefined,
	now = Date.now(),
): boolean => {
	if (!lastUserReplyAt) return false;
	const lastReply = new Date(lastUserReplyAt).getTime();
	if (!Number.isFinite(lastReply) || now - lastReply < NUDGE_INTERVAL_MS) return false;
	if (!lastNudgeAt) return true;
	const lastNudge = new Date(lastNudgeAt).getTime();
	return !Number.isFinite(lastNudge) || now - lastNudge >= NUDGE_INTERVAL_MS;
};

export const computeDisciplineDelta = (
	tasksChanged: boolean,
	replied: boolean,
): number => {
	if (tasksChanged && replied) return 5;
	if (!tasksChanged && !replied) return -5;
	return 0;
};

// --- インターフェース ＆ DI クライアント ---

export interface PushClient {
	pushMessage(userId: string, text: string): Promise<void>;
}

export function createLinePushClient(channelAccessToken?: string): PushClient {
	return {
		async pushMessage(userId: string, text: string) {
			if (
				!channelAccessToken ||
				!userId ||
				userId === "your_line_user_id_here"
			) {
				console.warn(
					"[Push Message Mock]: LINE credentials missing or default. Outputting to console:",
				);
				console.log(`>>> USER[${userId}]: ${text}`);
				return;
			}

			const client = new messagingApi.MessagingApiClient({
				channelAccessToken,
			});

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
		},
	};
}

export function createInMemoryPushClient(
	sentLog: { userId: string; text: string }[],
): PushClient {
	return {
		async pushMessage(userId: string, text: string) {
			sentLog.push({ userId, text });
		},
	};
}

// --- 副作用を持つ I/O 関数 ---

export async function fetchGoogleTasksWithIds(userId: string) {
	const tasks = await listGoogleTasks({
		onInvalidGrant: (detail) => void notifyTokenExpired(userId, detail),
	});
	return { tasks, taskIds: extractTaskIds(tasks) };
}

export async function sendAndRecordPush(
	pushClient: PushClient,
	userId: string,
	category: "Morning" | "Progress" | "Evening",
	message: string,
) {
	await appendSentMessage(userId, getTodayDateString(), category, message);
	await pushClient.pushMessage(userId, message);
}

export async function handleCronRoute(
	label: string,
	handler: () => Promise<Record<string, unknown>>,
) {
	try {
		const result = await handler();
		return { success: true, ...result };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[Cron ${label} Error]:`, message);
		return { success: false, error: message, _status: 500 as const };
	}
}
