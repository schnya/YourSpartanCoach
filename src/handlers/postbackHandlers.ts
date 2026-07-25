import type { messagingApi, WebhookEvent } from "@line/bot-sdk";
import { buildSpartanPrompt } from "../services/contextBuilder.js";
import { generateMessage } from "../services/llm.js";
import {
	type FsmStateData,
	getDisciplineScore,
	setUserState,
} from "../services/memory/fsmStore.js";

// Helper: Send reply text message via LINE MessagingApiClient
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

export async function handleStartAction(
	userId: string,
	stateData: FsmStateData,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	if (stateData.state !== "SCHEDULED") {
		return await replyText(
			client,
			replyToken,
			"【警告】現在はタスク開始を受け付ける状態ではない。朝の計画が承認されているか確認せよ。",
		);
	}

	const updatedMetadata = { ...stateData.metadata };
	await setUserState(userId, "EXECUTING", updatedMetadata);

	const prompt = await buildSpartanPrompt(userId, "EXECUTING", updatedMetadata);
	const systemMsg = await generateMessage(
		`${prompt}\n\nユーザーがタスク「${updatedMetadata.taskText}」の開始をタップしました。これから作業に向かうユーザーへ、規律を鼓舞する短いメッセージを出力してください。`,
	);
	const responseText =
		systemMsg || "タスク開始を確認した。逃げ道は塞がれた。直ちに実行せよ。";

	return await replyText(client, replyToken, responseText);
}

export async function handleCompleteAction(
	userId: string,
	stateData: FsmStateData,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	if (stateData.state !== "EXECUTING") {
		return await replyText(
			client,
			replyToken,
			"【警告】現在は実績報告を受け付ける状態ではない。実行中のタスクが存在しない。",
		);
	}

	const deadline = new Date();
	deadline.setMinutes(deadline.getMinutes() + 15);

	const updatedMetadata = {
		...stateData.metadata,
		reportingDeadline: deadline.toISOString(),
	};
	await setUserState(userId, "REPORTING", updatedMetadata);

	const timeFormatted = deadline.toLocaleTimeString("ja-JP", {
		timeZone: "Asia/Tokyo",
		hour: "2-digit",
		minute: "2-digit",
	});
	const responseText = `【実行完了申告】完了を確認した。これより15分以内（${timeFormatted}まで）に、事前に合意した証拠（成果物の画像またはテキスト）を提出せよ。タイムリミットを過ぎれば未達成とみなす。`;

	return await replyText(client, replyToken, responseText);
}

export async function handleSosAction(
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	return await client.replyMessage({
		replyToken,
		messages: [
			{
				type: "text",
				text: "【SOS確認】動けない理由はどちらだ？\n① 気が重い／怖い（心理的抵抗）\n② 物理的に無理（体調不良・急用）",
				quickReply: {
					items: [
						{
							type: "action",
							action: {
								type: "postback",
								label: "① 気が重い/怖い",
								data: "action=sos_mental",
								displayText: "① 気が重い/怖い",
							},
						},
						{
							type: "action",
							action: {
								type: "postback",
								label: "② 物理的に無理",
								data: "action=sos_physical",
								displayText: "② 物理的に無理",
							},
						},
					],
				},
			},
		],
	});
}

export async function handleSosMentalAction(
	userId: string,
	stateData: FsmStateData,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	const deadline = new Date();
	deadline.setMinutes(deadline.getMinutes() + 10);
	await setUserState(userId, "REPORTING", {
		...stateData.metadata,
		reportingDeadline: deadline.toISOString(),
		slicedTask: true,
	});

	const responseText =
		"【心理的抵抗検知】怖たままでええ。完璧を捨て、死なないサイズ（10分間 / 1行）に刻んで今すぐ着手せよ。10分以内に1行だけ成果物を提出せよ。";
	return await replyText(client, replyToken, responseText);
}

export async function handleSosPhysicalAction(
	userId: string,
	stateData: FsmStateData,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	const currentPostpone = stateData.metadata?.physicalPostponeCount || 0;
	await setUserState(userId, "IDLE", {
		...stateData.metadata,
		physicalPostponeCount: currentPostpone + 1,
	});

	const responseText = `【予定延期承認】物理的制約による延期を1回として記録した。（累計延期回数: ${currentPostpone + 1}回）。無理は禁物だ。十分に静養・調整し、次回07:00の計画入力から再開せよ。`;
	return await replyText(client, replyToken, responseText);
}

export async function handleStatusAction(
	userId: string,
	stateData: FsmStateData,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	const score = await getDisciplineScore(userId);
	const postponeCount = stateData.metadata?.physicalPostponeCount || 0;
	const responseText = `【規律ステータス】
現在の状態: ${stateData.state}
規律スコア: ${score} / 100
進行中のタスク: ${stateData.metadata?.taskText || "なし"}
成果物の定義: ${stateData.metadata?.proofDefinition || "なし"}
物理的延期累計: ${postponeCount}回`;

	return await replyText(client, replyToken, responseText);
}

export async function handlePostbackEvent(
	event: Extract<WebhookEvent, { type: "postback" }>,
	stateData: FsmStateData,
	client: messagingApi.MessagingApiClient,
) {
	const replyToken = event.replyToken;
	const userId = event.source?.userId;
	if (!replyToken || !userId) return;

	const data = event.postback.data;
	console.log(`[Webhook Postback Received]: data=${data} from user=${userId}`);

	switch (data) {
		case "action=start":
			return await handleStartAction(userId, stateData, replyToken, client);
		case "action=complete":
			return await handleCompleteAction(userId, stateData, replyToken, client);
		case "action=sos":
			return await handleSosAction(replyToken, client);
		case "action=sos_mental":
			return await handleSosMentalAction(userId, stateData, replyToken, client);
		case "action=sos_physical":
			return await handleSosPhysicalAction(
				userId,
				stateData,
				replyToken,
				client,
			);
		case "action=status":
			return await handleStatusAction(userId, stateData, replyToken, client);
		default:
			return;
	}
}
