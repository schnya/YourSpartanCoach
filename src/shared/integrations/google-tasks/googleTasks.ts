export interface GoogleTaskParams {
	taskText: string;
	targetStartTime?: string;
	targetDuration?: number;
	proofDefinition?: string;
}

export interface GoogleTaskItem {
	id: string;
	title: string;
	notes?: string;
	due?: string;
	status?: string;
}

export interface GetAccessTokenOptions {
	// invalid_grant（トークン失効/取り消し）を検知したときに呼ばれる。
	// 失効時に bot へ警告を飛ばすフックとして使う。
	onInvalidGrant?: (detail: string) => void;
}

export async function getAccessToken(
	opts?: GetAccessTokenOptions,
): Promise<string | null> {
	const clientId = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
	const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

	if (!clientId || !clientSecret || !refreshToken) {
		console.warn(
			"[Google Tasks Warning]: OAuth credentials not configured. Skipping Google Tasks sync.",
		);
		return null;
	}

	try {
		const res = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				refresh_token: refreshToken,
				grant_type: "refresh_token",
			}),
		});

		if (!res.ok) {
			const errText = await res.text();
			console.error(
				`[Google Tasks Token Error]: HTTP ${res.status} - ${errText}`,
			);
			// トークン失効/取り消し: 再認証が必要。
			if (res.status === 400 && /invalid_grant/.test(errText)) {
				opts?.onInvalidGrant?.(errText);
			}
			return null;
		}

		const data = (await res.json()) as { access_token?: string };
		return data.access_token || null;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[Google Tasks Token Fetch Exception]:", msg);
		return null;
	}
}

export async function createGoogleTask(
	params: GoogleTaskParams,
): Promise<string | null> {
	try {
		const token = await getAccessToken();
		if (!token) return null;

		const listId = process.env.GOOGLE_TASKS_LIST_ID || "@default";
		const timePrefix = params.targetStartTime
			? `[${params.targetStartTime}] `
			: "";
		const durationText = params.targetDuration
			? ` (${params.targetDuration}分ブロック)`
			: " (60分ブロック)";
		const title = `${timePrefix}${params.taskText}${durationText}`;

		const notes = `開始予定: ${params.targetStartTime || "未指定"} | 所要時間: ${params.targetDuration || 60}分 | 成果物定義: ${params.proofDefinition || "未指定"}`;

		const res = await fetch(
			`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					title,
					notes,
				}),
			},
		);

		if (!res.ok) {
			const errText = await res.text();
			console.error(
				`[Google Tasks Create Error]: HTTP ${res.status} - ${errText}`,
			);
			return null;
		}

		const data = (await res.json()) as { id?: string };
		console.log(`[Google Tasks Success]: Created task ID = ${data.id}`);
		return data.id || null;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[Google Tasks Create Exception]:", msg);
		return null;
	}
}

export async function completeGoogleTask(taskId: string): Promise<boolean> {
	if (!taskId) return false;

	try {
		const token = await getAccessToken();
		if (!token) return false;

		const listId = process.env.GOOGLE_TASKS_LIST_ID || "@default";
		const res = await fetch(
			`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					status: "completed",
				}),
			},
		);

		if (!res.ok) {
			const errText = await res.text();
			console.error(
				`[Google Tasks Complete Error]: HTTP ${res.status} - ${errText}`,
			);
			return false;
		}

		console.log(`[Google Tasks Success]: Completed task ID = ${taskId}`);
		return true;
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[Google Tasks Complete Exception]:", msg);
		return false;
	}
}

export async function listGoogleTasks(
	opts?: GetAccessTokenOptions,
): Promise<GoogleTaskItem[]> {
	try {
		const token = await getAccessToken(opts);
		if (!token) return [];

		const listId = process.env.GOOGLE_TASKS_LIST_ID || "@default";
		const res = await fetch(
			`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?showCompleted=false&showHidden=false`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);

		if (!res.ok) {
			const errText = await res.text();
			console.error(
				`[Google Tasks List Error]: HTTP ${res.status} - ${errText}`,
			);
			return [];
		}

		const data = (await res.json()) as { items?: GoogleTaskItem[] };
		return data.items || [];
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[Google Tasks List Exception]:", msg);
		return [];
	}
}


export function findMatchingGoogleTask(
	targetText: string,
	googleTaskIdFromLlm: string | undefined,
	existingTasks: GoogleTaskItem[],
): GoogleTaskItem | null {
	if (!existingTasks.length) return null;

	if (googleTaskIdFromLlm) {
		const foundById = existingTasks.find((t) => t.id === googleTaskIdFromLlm);
		if (foundById) return foundById;
	}

	const normalizedTarget = targetText.trim().toLowerCase();

	for (const task of existingTasks) {
		if (!task.title) continue;
		const normalizedTitle = task.title.trim().toLowerCase();
		if (
			normalizedTarget === normalizedTitle ||
			normalizedTarget.includes(normalizedTitle) ||
			normalizedTitle.includes(normalizedTarget)
		) {
			return task;
		}
	}

	return null;
}

// トークン失効時に bot が LINE へ送る警告メッセージを組み立てる。
function buildTokenExpiredMessage(detail: string): string {
	return [
		"⚠️ Google Tasks の認証トークンが失効（または取り消し）されました。",
		"タスクの読み込みができなくなっています。以下で再認証してください:",
		"",
		"① ローカルでトークン再発行:",
		"  deno run -A scripts/genGoogleToken.mjs",
		"② 本番の環境変数 GOOGLE_REFRESH_TOKEN を新しい値に上書き",
		"③ デプロイ反映: deno task deploy",
		"",
		`詳細: ${detail.slice(0, 200)}`,
	].join("\n");
}

// LINE へトークン失効アラートを送る（token 未設定時はログのみ）。
// cooldownHours 以内の再送は抑止して spam を防ぐ。
const TOKEN_ALERT_COOLDOWN_MS = (() => {
	const h = Number(process.env.GOOGLE_TOKEN_ALERT_COOLDOWN_HOURS);
	return (Number.isFinite(h) && h > 0 ? h : 24) * 60 * 60 * 1000;
})();

let lastAlertAt = 0;

export async function notifyTokenExpired(
	userId: string | undefined,
	detail: string,
): Promise<void> {
	const now = Date.now();
	if (now - lastAlertAt < TOKEN_ALERT_COOLDOWN_MS) {
		console.warn(
			"[Google Tasks Token Expired]: クールダウン中のためアラート送信をスキップ。",
		);
		return;
	}
	lastAlertAt = now;

	const channelAccessToken = process.env.TELEGRAM_BOT_TOKEN;
	const targetId = userId || process.env.TELEGRAM_USER_ID;

	if (!channelAccessToken || !targetId || targetId === "your_telegram_user_id_here") {
		console.warn(
			"[Google Tasks Token Expired Alert (mock)]:",
			buildTokenExpiredMessage(detail),
		);
		return;
	}

	try {
		const { createTelegramClient } = await import(
			"../../integrations/telegram/telegramClient.js"
		);
		const client = createTelegramClient(channelAccessToken);
		await client.sendMessage(targetId, buildTokenExpiredMessage(detail));
		console.log(`[Google Tasks Token Expired Alert]: Sent to user=${targetId}`);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("[Google Tasks Token Expired Alert Error]:", msg);
	}
}
