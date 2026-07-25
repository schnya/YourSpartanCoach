import {
	messagingApi,
	validateSignature,
	type WebhookRequestBody,
} from "@line/bot-sdk";
import { Hono } from "hono";
import { buildSpartanPrompt } from "../services/contextBuilder.js";
import { generateMessage, generateMessageMultimodal } from "../services/llm.js";
import {
	appendPlannedTask,
	appendRawUserLog,
	checkAndMarkEventProcessed,
	getDisciplineScore,
	getTodayDateString,
	getUserState,
	setUserState,
	updateDisciplineScore,
} from "../services/memoryStore.js";

// @lat: [[routing#Webhook Endpoint]]
const webhookApp = new Hono();

webhookApp.post("/", async (c) => {
	try {
		const channelSecret = (
			process.env.LINE_CHANNEL_SECRET ||
			(c.env as Record<string, string>)?.LINE_CHANNEL_SECRET ||
			""
		).trim();
		const channelAccessToken = (
			process.env.LINE_CHANNEL_ACCESS_TOKEN ||
			(c.env as Record<string, string>)?.LINE_CHANNEL_ACCESS_TOKEN ||
			""
		).trim();

		console.log(
			`[Webhook Env Check]: Token Length = ${channelAccessToken.length}, Secret Length = ${channelSecret.length}`,
		);

		const signature = c.req.header("x-line-signature");
		const bodyText = await c.req.text();

		if (!signature) {
			console.warn("[Webhook Warning]: Missing x-line-signature header");
			return c.text("Missing signature", 401);
		}

		if (channelSecret) {
			const isValid = validateSignature(bodyText, channelSecret, signature);
			if (!isValid) {
				console.error("[Webhook Error]: Invalid signature verification failed");
				return c.text("Invalid signature", 401);
			}
		}

		let body: WebhookRequestBody;
		try {
			body = JSON.parse(bodyText);
		} catch (err) {
			console.error("[Webhook Error]: Failed to parse JSON body", err);
			return c.text("Bad Request", 400);
		}

		const today = getTodayDateString();
		const client = channelAccessToken
			? new messagingApi.MessagingApiClient({ channelAccessToken })
			: null;
		const blobClient = channelAccessToken
			? new messagingApi.MessagingApiBlobClient({ channelAccessToken })
			: null;

		if (body && Array.isArray(body.events)) {
			for (const event of body.events) {
				// 1. Idempotency Check
				const eventId =
					event.webhookEventId || `${event.timestamp}-${event.source?.userId}`;
				const isDuplicate = await checkAndMarkEventProcessed(eventId);
				if (isDuplicate) {
					console.warn(
						`[Webhook Warning]: Duplicate event detected and ignored: ${eventId}`,
					);
					continue;
				}

				const userId = event.source?.userId;
				if (!userId) {
					console.warn("[Webhook Warning]: Event source userId is missing.");
					continue;
				}

				// 2. Log message in daily database
				if (event.type === "message" && event.message.type === "text") {
					await appendRawUserLog(userId, today, event.message.text.trim());
				}

				const stateData = await getUserState(userId);
				const replyToken = "replyToken" in event ? event.replyToken : undefined;

				// 3. Postback Actions (Rich Menu interaction)
				if (event.type === "postback" && replyToken && client) {
					const data = event.postback.data;
					console.log(
						`[Webhook Postback Received]: data=${data} from user=${userId}`,
					);

					let replyText = "";
					if (data === "action=start") {
						if (stateData.state === "SCHEDULED") {
							// Transition SCHEDULED -> EXECUTING
							const updatedMetadata = { ...stateData.metadata };
							await setUserState(userId, "EXECUTING", updatedMetadata);

							// Build Spartan starting tone
							const prompt = await buildSpartanPrompt(
								userId,
								"EXECUTING",
								updatedMetadata,
							);
							const systemMsg = await generateMessage(
								`${prompt}\n\nユーザーがタスク「${updatedMetadata.taskText}」の開始をタップしました。これから作業に向かうユーザーへ、規律を鼓舞する短いメッセージを出力してください。`,
							);
							replyText =
								systemMsg ||
								"タスク開始を確認した。逃げ道は塞がれた。直ちに実行せよ。";
						} else {
							replyText =
								"【警告】現在はタスク開始を受け付ける状態ではない。朝の計画が承認されているか確認せよ。";
						}
					} else if (data === "action=complete") {
						if (stateData.state === "EXECUTING") {
							// Transition EXECUTING -> REPORTING (15min limit)
							const deadline = new Date();
							deadline.setMinutes(deadline.getMinutes() + 15);

							const updatedMetadata = {
								...stateData.metadata,
								reportingDeadline: deadline.toISOString(),
							};
							await setUserState(userId, "REPORTING", updatedMetadata);

							replyText = `【実行完了申告】完了を確認した。これより15分以内（${deadline.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}まで）に、事前に合意した証拠（成果物の画像またはテキスト）を提出せよ。タイムリミットを過ぎれば未達成とみなす。`;
						} else {
							replyText =
								"【警告】現在は実績報告を受け付ける状態ではない。実行中のタスクが存在しない。";
						}
					} else if (data === "action=sos") {
						// Send Quick Reply 2-Branch Query without debate
						await client.replyMessage({
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
						continue;
					} else if (data === "action=sos_mental") {
						// Option 1: Mental/Fear -> Zero debate, immediate 10-minute slice command
						const deadline = new Date();
						deadline.setMinutes(deadline.getMinutes() + 10);
						await setUserState(userId, "REPORTING", {
							...stateData.metadata,
							reportingDeadline: deadline.toISOString(),
							slicedTask: true,
						});

						replyText = "【心理的抵抗検知】怖たままでええ。完璧を捨て、死なないサイズ（10分間 / 1行）に刻んで今すぐ着手せよ。10分以内に1行だけ成果物を提出せよ。";
					} else if (data === "action=sos_physical") {
						// Option 2: Physical Constraint -> Log postpone count and reset to IDLE
						const currentPostpone = stateData.metadata?.physicalPostponeCount || 0;
						await setUserState(userId, "IDLE", {
							...stateData.metadata,
							physicalPostponeCount: currentPostpone + 1,
						});

						replyText = `【予定延期承認】物理的制約による延期を1回として記録した。（累計延期回数: ${currentPostpone + 1}回）。無理は禁物だ。十分に静養・調整し、次回07:00の計画入力から再開せよ。`;
					} else if (data === "action=status") {
						const score = await getDisciplineScore(userId);
						const postponeCount = stateData.metadata?.physicalPostponeCount || 0;
						replyText = `【規律ステータス】
現在の状態: ${stateData.state}
規律スコア: ${score} / 100
進行中のタスク: ${stateData.metadata?.taskText || "なし"}
成果物の定義: ${stateData.metadata?.proofDefinition || "なし"}
物理的延期累計: ${postponeCount}回`;
					}

					if (replyText) {
						await client.replyMessage({
							replyToken,
							messages: [{ type: "text", text: replyText }],
						});
					}
					continue;
				}

				// 4. Message Actions (Text and Images)
				if (event.type === "message" && replyToken && client) {
					// A. Image message in REPORTING state
					if (
						event.message.type === "image" &&
						stateData.state === "REPORTING" &&
						blobClient
					) {
						const messageId = event.message.id;
						console.log(
							`[Webhook Image Received]: Downloading content for message=${messageId}`,
						);

						try {
							const stream = await blobClient.getMessageContent(messageId);
							const chunks: Buffer[] = [];
							for await (const chunk of stream) {
								chunks.push(
									typeof chunk === "string" ? Buffer.from(chunk) : chunk,
								);
							}
							const imageBuffer = Buffer.concat(chunks);

							const spartanPrompt = await buildSpartanPrompt(
								userId,
								"REPORTING",
								stateData.metadata,
							);
							const evaluationPrompt = `${spartanPrompt}

ユーザーから成果物としての画像が提出されました。
タスク: "${stateData.metadata?.taskText}"
合格基準: "${stateData.metadata?.proofDefinition}"

提出された画像が、合格基準を完全に満たしているか厳格に審査してください。
必ず以下のフォーマットのいずれかで出力してください。余計な説明文は一切含めないでください。

【合格の場合】
PASS: <ユーザーへの合格・称賛メッセージ>

【不合格の場合】
FAIL: <ユーザーへの不合格メッセージと10分以内の再提出命令>`;

							const result = await generateMessageMultimodal(
								evaluationPrompt,
								imageBuffer,
								"image/jpeg",
							);
							console.log(`[ARES Verification Result]: ${result}`);

							if (result.startsWith("PASS:")) {
								const cleanMsg = result.replace("PASS:", "").trim();
								await updateDisciplineScore(userId, 1);
								await setUserState(userId, "IDLE");
								await client.replyMessage({
									replyToken,
									messages: [
										{
											type: "text",
											text:
												cleanMsg ||
												"成果物承認。タスク完了とする。規律スコア+1。",
										},
									],
								});
							} else {
								const cleanMsg = result.replace("FAIL:", "").trim();
								// Update deadline to 10 minutes from now for resubmission
								const deadline = new Date();
								deadline.setMinutes(deadline.getMinutes() + 10);
								await setUserState(userId, "REPORTING", {
									...stateData.metadata,
									reportingDeadline: deadline.toISOString(),
								});
								await client.replyMessage({
									replyToken,
									messages: [
										{
											type: "text",
											text: cleanMsg || "成果物不備。10分以内に再提出せよ。",
										},
									],
								});
							}
						} catch (err) {
							console.error("[Image Verification Error]:", err);
							await client.replyMessage({
								replyToken,
								messages: [
									{
										type: "text",
										text: "【システムエラー】成果物画像の処理に失敗した。再送信するか、テキストで証拠を提示せよ。",
									},
								],
							});
						}
						continue;
					}

					// B. Text message processing
					if (event.message.type === "text") {
						const text = event.message.text.trim();
						console.log(
							`[Webhook Text Message Received]: ${text} in state=${stateData.state}`,
						);

						// Skip default command handlers if user is doing FSM flow
						if (stateData.state === "IDLE" || stateData.state === "PENDING") {
							// Morning Plan Assessment
							const spartanPrompt = await buildSpartanPrompt(userId, "PENDING");
							const assessmentPrompt = `${spartanPrompt}

ユーザーの入力: "${text}"

上記入力について審査を行ってください。
必ず以下のフォーマットのいずれかで出力してください。余計な説明文は一切含めないでください。

【却下の場合】
REJECT: <ユーザーへの却下メッセージ>

【承認の場合】
APPROVE: {"task": "<タスク内容>", "startTime": "<開始時刻 HH:MM>", "duration": <所要時間（数値、分）>, "proof": "<合格とする証拠物の定義>"}
MESSAGE: <ユーザーへの承認・激励メッセージ>`;

							const result = await generateMessage(assessmentPrompt);
							console.log(`[ARES Plan Assessment Result]: ${result}`);

							if (result.startsWith("APPROVE:")) {
								const match = result.match(
									/APPROVE:\s*({.+?})\s*\n*MESSAGE:\s*(.+)$/s,
								);
								if (match) {
									try {
										const meta = JSON.parse(match[1]);
										const message = match[2].trim();

										const todayStr = getTodayDateString();
										await setUserState(userId, "SCHEDULED", {
											taskText: meta.task,
											targetStartTime: meta.startTime,
											targetDuration: meta.duration,
											proofDefinition: meta.proof,
											targetDateStr: todayStr,
										});

										// Add task to daily log
										await appendPlannedTask(userId, todayStr, meta.task);

										await client.replyMessage({
											replyToken,
											messages: [{ type: "text", text: message }],
										});
									} catch (jsonErr) {
										console.error("[Plan Approval JSON Parse Error]:", jsonErr);
										await client.replyMessage({
											replyToken,
											messages: [
												{
													type: "text",
													text: "【却下】計画の解析に失敗した。より明確に行動、開始時間、所要時間、証拠を定義して再送信せよ。",
												},
											],
										});
									}
								} else {
									await client.replyMessage({
										replyToken,
										messages: [
											{
												type: "text",
												text: "【却下】計画フォーマットが無効だ。何時に、何を行い、何を提出するのか明確にせよ。",
											},
										],
									});
								}
							} else {
								const cleanMsg = result.replace("REJECT:", "").trim();
								await setUserState(userId, "PENDING");
								await client.replyMessage({
									replyToken,
									messages: [
										{
											type: "text",
											text: cleanMsg || "計画却下。再提出せよ。",
										},
									],
								});
							}
							continue;
						}

						if (stateData.state === "REPORTING") {
							// Text Proof Verification
							const spartanPrompt = await buildSpartanPrompt(
								userId,
								"REPORTING",
								stateData.metadata,
							);
							const evaluationPrompt = `${spartanPrompt}

ユーザーからテキストによる成果証拠が提出されました。
証拠テキスト: "${text}"
タスク: "${stateData.metadata?.taskText}"
合格基準: "${stateData.metadata?.proofDefinition}"

提出されたテキストが、合格基準を完全に満たしているか厳格に審査してください。
必ず以下のフォーマットのいずれかで出力してください。余計な説明文は一切含めないでください。

【合格の場合】
PASS: <ユーザーへの合格・称賛メッセージ>

【不合格の場合】
FAIL: <ユーザーへの不合格メッセージと10分以内の再提出命令>`;

							const result = await generateMessage(evaluationPrompt);
							console.log(`[ARES Text Verification Result]: ${result}`);

							if (result.startsWith("PASS:")) {
								const cleanMsg = result.replace("PASS:", "").trim();
								await updateDisciplineScore(userId, 1);
								await setUserState(userId, "IDLE");
								await client.replyMessage({
									replyToken,
									messages: [
										{
											type: "text",
											text: cleanMsg || "成果承認。タスク完了。規律スコア+1。",
										},
									],
								});
							} else {
								const cleanMsg = result.replace("FAIL:", "").trim();
								const deadline = new Date();
								deadline.setMinutes(deadline.getMinutes() + 10);
								await setUserState(userId, "REPORTING", {
									...stateData.metadata,
									reportingDeadline: deadline.toISOString(),
								});
								await client.replyMessage({
									replyToken,
									messages: [
										{
											type: "text",
											text: cleanMsg || "成果物不備。10分以内に再提出せよ。",
										},
									],
								});
							}
							continue;
						}

						// Default fallback if not in critical state
						const replyText = "了解。ログに記録した。";
						await client.replyMessage({
							replyToken,
							messages: [{ type: "text", text: replyText }],
						});
					}
				}
			}
		}

		return c.text("OK", 200);
	} catch (globalErr: unknown) {
		const errDetail =
			globalErr instanceof Error ? globalErr.message : String(globalErr);
		console.error("[Webhook Critical Error]:", errDetail);
		return c.text("Internal Server Error", 500);
	}
});

export default webhookApp;
