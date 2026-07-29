import type { messagingApi } from "@line/bot-sdk";
import {
	appendRawUserLog,
	appendSentMessage,
	getTodayDateString,
} from "../../shared/memory/dailyLogStore.js";
import { getUserState, setUserState } from "../../shared/memory/fsmStore.js";

async function replyText(
	client: messagingApi.MessagingApiClient,
	replyToken: string,
	text: string,
) {
	return await client.replyMessage({
		replyToken,
		messages: [{ type: "text", text }],
	});
}

// ユーザーからの任意の投稿（テキスト・画像）を「記録」として扱い、
// 「記録したよ 👍」を自動返信する。AI 審査・状態遷移の承認は行わない。
// 返信フラグを立て、IDLE（未確認）状態なら ACTIVE に復帰させる。
export async function handleUserLogMessage(
	userId: string,
	rawText: string,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
	isImage = false,
) {
	const today = getTodayDateString();
	const logText = isImage ? "[画像を記録]" : rawText;
	await appendRawUserLog(userId, today, logText);

	// 返信フラグ + タイムスタンプ更新、IDLE→ACTIVE 復帰
	const stateData = await getUserState(userId);
	const wasIdle = stateData.state === "IDLE";
	await setUserState(userId, "ACTIVE", {
		...stateData.metadata,
		repliedToday: true,
		lastUserReplyAt: new Date().toISOString(),
	});

	const reply = "記録したよ 👍";
	await appendSentMessage(userId, today, "Reply", reply);
	await replyText(client, replyToken, reply);

	void wasIdle;
	return;
}
