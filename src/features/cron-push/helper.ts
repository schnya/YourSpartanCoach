import { tz } from "@date-fns/tz";
import { format, subDays } from "date-fns";
import {
  listGoogleTasks,
  notifyTokenExpired,
} from "../../shared/integrations/google-tasks/googleTasks.js";
import {
  createTelegramClient,
  type MessagingClient,
} from "../../shared/integrations/telegram/telegramClient.js";
export type { MessagingClient } from "../../shared/integrations/telegram/telegramClient.js";

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

export const TZ_JST = tz("Asia/Tokyo");

export const getBathReminderDay = (date = new Date()): string => {
	const hour = Number(format(date, "H", { in: TZ_JST }));
	const targetDate = hour < 3 ? subDays(date, 1) : date;
	return format(targetDate, "yyyy-MM-dd", { in: TZ_JST });
};

export const NUDGE_INTERVAL_MS = 4 * 60 * 60 * 1000;

export const isStale = (isoDate: string | undefined, now: number): boolean => {
	if (!isoDate) return true;
	const time = new Date(isoDate).getTime();
	return !Number.isFinite(time) || now - time >= NUDGE_INTERVAL_MS;
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

export function buildQuickReply(label?: string): unknown | undefined {
  if (!label) return undefined;
  return {
    keyboard: [[{ text: label }]],
    one_time_keyboard: true,
    resize_keyboard: true,
  };
}

// クロージャ + オブジェクトリテラルのファクトリ関数。
// LINE の PushClient 互換インターフェースを Telegram の MessagingClient に統一。
export function createLinePushClient(
  channelAccessToken?: string,
): MessagingClient {
  return createTelegramClient(channelAccessToken);
}

// --- 副作用を持つ I/O 関数 ---

export async function fetchGoogleTasksWithIds(userId: string) {
	const tasks = await listGoogleTasks({
		onInvalidGrant: (detail) => void notifyTokenExpired(userId, detail),
	});
	return { tasks, taskIds: extractTaskIds(tasks) };
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
