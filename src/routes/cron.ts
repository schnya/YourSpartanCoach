import { messagingApi } from "@line/bot-sdk";
import { Hono } from "hono";
import {
  buildAccountabilityPrompt,
  buildEveningPrompt,
  buildMorningPrompt,
  buildTaskPlanningPrompt,
} from "../services/contextBuilder.js";
import { generateMessage } from "../services/llm.js";
import {
  appendSentMessage,
  carryOverPendingTasks,
  getRecentLogs,
  getTodayDateString,
  readDailyLog,
  readPatterns,
  readUserProfile,
  resolveCurrentHp,
} from "../services/memoryStore.js";

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

async function sendPushMessage(text: string) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;

  if (!channelAccessToken || !userId || userId === "your_line_user_id_here") {
    console.warn("[Push Message Mock]: LINE credentials missing or default. Outputting to console:");
    console.log(`>>> ${text}`);
    return;
  }

  const client = new messagingApi.MessagingApiClient({ channelAccessToken });

  try {
    await client.pushMessage({
      to: userId,
      messages: [{ type: "text", text }],
    });
    console.log("[Push Message Success]: Sent to LINE user!");
  } catch (err: unknown) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    console.error("[LINE Push Message Error Detail]:", errorDetail);
  }
}

// 朝の Cron (/cron/morning)
cronApp.get("/morning", async (c) => {
  try {
    const today = getTodayDateString();

    // 前日（1日前）の日付を算出
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

    // 前日の未完了タスクを当日にキャリーオーバー
    const carriedCount = await carryOverPendingTasks(yesterday, today);
    if (carriedCount > 0) {
      console.log(`[Task Carry-over]: Carried ${carriedCount} pending tasks from ${yesterday} to ${today}`);
    }

    const profile = await readUserProfile();
    const patterns = await readPatterns();
    const recentLogs = await getRecentLogs(3);
    const hp = await resolveCurrentHp(recentLogs);

    const prompt = await buildMorningPrompt(profile, patterns, recentLogs, hp);
    const morningMsg = await generateMessage(
      prompt,
      process.env.GEMINI_MODEL_MORNING || "gemini-3.1-flash-lite"
    );

    await appendSentMessage(today, "Morning", morningMsg);
    await sendPushMessage(morningMsg);

    return c.json({ success: true, type: "morning", message: morningMsg, carriedTasks: carriedCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Cron Morning Error]:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

// 夜の Cron (/cron/evening)
cronApp.get("/evening", async (c) => {
  try {
    const profile = await readUserProfile();
    const patterns = await readPatterns();
    const today = getTodayDateString();
    const todayLog = await readDailyLog(today);

    const prompt = await buildEveningPrompt(profile, patterns, todayLog);
    const eveningMsg = await generateMessage(
      prompt,
      process.env.GEMINI_MODEL_EVENING || "gemini-3.1-flash-lite"
    );

    await appendSentMessage(today, "Evening", eveningMsg);
    await sendPushMessage(eveningMsg);

    return c.json({ success: true, type: "evening", message: eveningMsg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Cron Evening Error]:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

// タスクプランニング (/cron/task-plan)
cronApp.get("/task-plan", async (c) => {
  try {
    const profile = await readUserProfile();
    const patterns = await readPatterns();
    const today = getTodayDateString();
    const todayLog = await readDailyLog(today);
    const recentLogs = await getRecentLogs(3);
    const hp = await resolveCurrentHp(recentLogs);

    const prompt = await buildTaskPlanningPrompt(profile, patterns, todayLog, "指定なし", hp);
    const planMsg = await generateMessage(
      prompt,
      process.env.GEMINI_MODEL_TASK_PLAN || "gemini-3.1-flash-lite"
    );

    await appendSentMessage(today, "Evening", `[Task Plan]\n${planMsg}`);
    await sendPushMessage(planMsg);

    return c.json({ success: true, type: "task-plan", message: planMsg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Cron Task Plan Error]:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

// アカウンタビリティチェック (/cron/accountability)
cronApp.get("/accountability", async (c) => {
  try {
    const profile = await readUserProfile();
    const patterns = await readPatterns();
    const today = getTodayDateString();
    const todayLog = await readDailyLog(today);
    const recentLogs = await getRecentLogs(3);
    const hp = await resolveCurrentHp(recentLogs);

    const prompt = await buildAccountabilityPrompt(
      profile,
      patterns,
      "",
      todayLog,
      todayLog,
      hp
    );
    const accountabilityMsg = await generateMessage(
      prompt,
      process.env.GEMINI_MODEL_ACCOUNTABILITY || "gemini-3.1-flash-lite"
    );

    await appendSentMessage(today, "Evening", `[Accountability]\n${accountabilityMsg}`);
    await sendPushMessage(accountabilityMsg);

    return c.json({ success: true, type: "accountability", message: accountabilityMsg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Cron Accountability Error]:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

export default cronApp;
