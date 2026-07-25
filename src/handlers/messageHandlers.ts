import type { messagingApi } from "@line/bot-sdk";
import { buildSpartanPrompt } from "../services/contextBuilder.js";
import {
	completeGoogleTask,
	createGoogleTask,
	findMatchingGoogleTask,
	listGoogleTasks,
} from "../services/googleTasks.js";
import { generateMessage, generateMessageMultimodal } from "../services/llm.js";
import {
	appendPlannedTask,
	getTodayDateString,
} from "../services/memory/dailyLogStore.js";
import {
	type FsmStateData,
	setUserState,
	updateDisciplineScore,
} from "../services/memory/fsmStore.js";

// Fire-and-forget Google Tasks sync. Best-effort only: never blocks the LINE
// reply or FSM transition, and swallows all errors internally.
// @lat: [[memory#Google Tasks Integration]]
function syncGoogleTask<T>(
	task: () => Promise<T>,
	onDone: (result: NonNullable<T>) => void,
) {
	task()
		.then((result) => {
			if (
				result !== null &&
				result !== undefined &&
				result !== (false as unknown)
			) {
				onDone(result as NonNullable<T>);
			}
		})
		.catch((err: unknown) => {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("[Google Tasks Sync Error]:", msg);
		});
}

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

export type ProofInput =
	| { type: "image"; imageBuffer: Buffer; mimeType: string }
	| { type: "text"; text: string };

export type ProofEvaluationResult =
	| { passed: true; feedbackMessage: string }
	| { passed: false; feedbackMessage: string };

/**
 * 提出された証拠（画像/テキスト）をLLMで厳格審査し、合格/不合格の結果のみを返す（副作用ゼロ）
 */
export async function evaluateProof(
	userId: string,
	proofInput: ProofInput,
	metadata?: FsmStateData["metadata"],
): Promise<ProofEvaluationResult> {
	const spartanPrompt = await buildSpartanPrompt(userId, "REPORTING", metadata);

	const proofDescription =
		proofInput.type === "image"
			? "ユーザーから成果物としての画像が提出されました。"
			: `ユーザーからテキストによる成果証拠が提出されました。\n証拠テキスト: "${proofInput.text}"`;

	const evaluationPrompt = `${spartanPrompt}

${proofDescription}
タスク: "${metadata?.taskText}"
合格基準: "${metadata?.proofDefinition}"

提出された証拠が、合格基準を完全に満たしているか厳格に審査してください。
必ず以下のフォーマットのいずれかで出力してください。余計な説明文は一切含めないでください。

【合格の場合】
PASS: <ユーザーへの合格・称賛メッセージ>

【不合格の場合】
FAIL: <ユーザーへの不合格メッセージと10分以内の再提出命令>`;

	let rawResult: string;
	if (proofInput.type === "image") {
		rawResult = await generateMessageMultimodal(
			evaluationPrompt,
			proofInput.imageBuffer,
			proofInput.mimeType,
		);
	} else {
		rawResult = await generateMessage(evaluationPrompt);
	}

	console.log(`[ARES Verification Result]: ${rawResult}`);

	if (rawResult.startsWith("PASS:")) {
		const cleanMsg = rawResult.replace("PASS:", "").trim();
		return {
			passed: true,
			feedbackMessage:
				cleanMsg || "成果物承認。タスク完了とする。規律スコア+1。",
		};
	}

	const cleanMsg = rawResult.replace("FAIL:", "").trim();
	return {
		passed: false,
		feedbackMessage: cleanMsg || "成果物不備。10分以内に再提出せよ。",
	};
}

/**
 * 評価結果に基づき、DB/FSM更新、Google Tasks同期(ベストエフォート)、LINE返信を実行する
 */
export async function applyProofResult(
	userId: string,
	stateData: FsmStateData,
	result: ProofEvaluationResult,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	if (result.passed) {
		// 順序: 規律スコア加算 ➔ FSM状態遷移 (IDLE) ➔ Google Tasks同期 ➔ LINE返信
		// Redis書き込み（スコア・状態）は優先確定させる
		await updateDisciplineScore(userId, 1);
		await setUserState(userId, "IDLE");

		// Google Tasks完了同期 (ベストエフォート)
		// @lat: [[memory#Google Tasks Integration]]
		const googleTaskId = stateData.metadata?.googleTaskId;
		if (googleTaskId) {
			syncGoogleTask(
				() => completeGoogleTask(googleTaskId),
				() => console.log(`[Google Tasks Sync]: Task ${googleTaskId} completed`),
			);
		}

		// LINE返信送信 (失敗してもFSM状態は確定済みのため巻き戻さない)
		return await replyText(client, replyToken, result.feedbackMessage);
	}

	// 不合格時: 10分後のデッドラインをセットして REPORTING 状態を維持
	const deadline = new Date();
	deadline.setMinutes(deadline.getMinutes() + 10);

	await setUserState(userId, "REPORTING", {
		...stateData.metadata,
		reportingDeadline: deadline.toISOString(),
	});

	return await replyText(client, replyToken, result.feedbackMessage);
}

export async function handleImageMessage(
	messageId: string,
	stateData: FsmStateData,
	userId: string,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
	blobClient: messagingApi.MessagingApiBlobClient,
) {
	if (stateData.state !== "REPORTING") return;

	console.log(
		`[Webhook Image Received]: Downloading content for message=${messageId}`,
	);

	try {
		const stream = await blobClient.getMessageContent(messageId);
		const chunks: Buffer[] = [];
		for await (const chunk of stream) {
			chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
		}
		const imageBuffer = Buffer.concat(chunks);

		const result = await evaluateProof(
			userId,
			{ type: "image", imageBuffer, mimeType: "image/jpeg" },
			stateData.metadata,
		);

		return await applyProofResult(userId, stateData, result, replyToken, client);
	} catch (err) {
		console.error("[Image Verification Error]:", err);
		return await replyText(
			client,
			replyToken,
			"【システムエラー】成果物画像の処理に失敗した。再送信するか、テキストで証拠を提示せよ。",
		);
	}
}

export async function handleMorningPlanMessage(
	userId: string,
	text: string,
	stateData: FsmStateData,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	const spartanPrompt = await buildSpartanPrompt(userId, "PENDING");
	const existingGoogleTasks = await listGoogleTasks();

	let taskContextStr = "";
	if (existingGoogleTasks.length > 0) {
		const formatted = existingGoogleTasks
			.map((t) => `ID: "${t.id}" タイトル: "${t.title}"`)
			.join("\n");
		taskContextStr = `\n現在 Google Tasks にある未完了タスク一覧:\n${formatted}\n`;
	}

	const assessmentPrompt = `${spartanPrompt}
${taskContextStr}
ユーザーの入力: "${text}"

上記入力について審査を行ってください。ユーザーの計画が上記の Google Tasks 一覧内のタスクに該当する場合は、その googleTaskId も抽出してください。
必ず以下のフォーマットのいずれかで出力してください。余計な説明文は一切含めないでください。

【却下の場合】
REJECT: <ユーザーへの却下メッセージ>

【承認の場合】
APPROVE: {"task": "<タスク内容>", "startTime": "<開始時刻 HH:MM>", "duration": <所要時間（数値、分）>, "proof": "<合格とする証拠物の定義>", "googleTaskId": "<該当するGoogle TaskのID（該当ある場合のみ、なければ省略またはnull）>"}
MESSAGE: <ユーザーへの承認・激励メッセージ>`;

	const result = await generateMessage(assessmentPrompt);
	console.log(`[ARES Plan Assessment Result]: ${result}`);

	if (result.startsWith("APPROVE:")) {
		const match = result.match(/APPROVE:\s*({.+?})\s*\n*MESSAGE:\s*(.+)$/s);
		if (match) {
			try {
				const meta = JSON.parse(match[1]);
				const message = match[2].trim();
				const todayStr = getTodayDateString();

				// コード側でのセーフティネット照合（LLM依存の排除）
				const matchedTask = findMatchingGoogleTask(
					meta.task,
					meta.googleTaskId,
					existingGoogleTasks,
				);

				const boundGoogleTaskId = matchedTask ? matchedTask.id : undefined;

				await setUserState(userId, "SCHEDULED", {
					taskText: meta.task,
					targetStartTime: meta.startTime,
					targetDuration: meta.duration,
					proofDefinition: meta.proof,
					targetDateStr: todayStr,
					googleTaskId: boundGoogleTaskId,
				});

				if (matchedTask) {
					console.log(
						`[Google Tasks Sync]: Matched existing Google Task ID = ${matchedTask.id}. Skipping duplicate create.`,
					);
				} else {
					// 完全に新規のタスクの場合のみ createGoogleTask を呼び出す
					// @lat: [[memory#Google Tasks Integration]]
					syncGoogleTask(
						() =>
							createGoogleTask({
								taskText: meta.task,
								targetStartTime: meta.startTime,
								targetDuration: meta.duration,
								proofDefinition: meta.proof,
							}),
						(taskId) =>
							setUserState(userId, "SCHEDULED", {
								...stateData.metadata,
								taskText: meta.task,
								targetStartTime: meta.startTime,
								targetDuration: meta.duration,
								proofDefinition: meta.proof,
								targetDateStr: todayStr,
								googleTaskId: taskId,
							}),
					);
				}

				await appendPlannedTask(userId, todayStr, meta.task);
				return await replyText(client, replyToken, message);
			} catch (jsonErr) {
				console.error("[Plan Approval JSON Parse Error]:", jsonErr);
				return await replyText(
					client,
					replyToken,
					"【却下】計画の解析に失敗した。より明確に行動、開始時間、所要時間、証拠を定義して再送信せよ。",
				);
			}
		}

		return await replyText(
			client,
			replyToken,
			"【却下】計画フォーマットが無効だ。何時に、何を行い、何を提出するのか明確にせよ。",
		);
	}

	const cleanMsg = result.replace("REJECT:", "").trim();
	await setUserState(userId, "PENDING");
	return await replyText(
		client,
		replyToken,
		cleanMsg || "計画却下。再提出せよ。",
	);
}

export async function handleTextProofMessage(
	userId: string,
	text: string,
	stateData: FsmStateData,
	replyToken: string,
	client: messagingApi.MessagingApiClient,
) {
	const result = await evaluateProof(
		userId,
		{ type: "text", text },
		stateData.metadata,
	);
	return await applyProofResult(userId, stateData, result, replyToken, client);
}
