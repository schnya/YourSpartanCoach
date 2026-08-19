import assert from "node:assert";
import { getUserState, setUserState } from "../../shared/memory/fsmStore.js";
import cronApp, { shouldSendNoResponseNudge } from "./cron.js";

interface DenoTestContext {
  step: (name: string, fn: () => void | Promise<void>) => Promise<boolean>;
}

declare const Deno: {
  test: (name: string, fn: (t: DenoTestContext) => void | Promise<void>) => void;
  env: {
    set: (key: string, value: string) => void;
    get: (key: string) => string | undefined;
    toObject?: () => Record<string, string>;
  };
};

//  env をモックして CRON_SECRET 認証と Telegram push を通す
const OLD_ENV = Deno.env.toObject?.() ?? {};
function withMockEnv() {
  Deno.env.set("CRON_SECRET", "test-secret");
  Deno.env.set("TELEGRAM_BOT_TOKEN", "");
  Deno.env.set("TELEGRAM_USER_ID", "test_user_evening");
}

Deno.test("cron /evening preserves bathCompletedAt", async (t) => {
  withMockEnv();
  const userId = "test_user_evening";

  await t.step("bathCompletedAt survives /evening reset until 03:00 JST", async () => {
    const dayKey = "2026-08-04"; // 任意の日付キー
    await setUserState(userId, "ACTIVE", {
      bathCompletedAt: dayKey,
      repliedToday: true,
    });

    const res = await cronApp.request("/evening", {
      headers: { Authorization: "Bearer test-secret" },
    });
    assert.strictEqual(res.status, 200);

    const state = await getUserState(userId);
    assert.strictEqual(
      state.metadata?.bathCompletedAt,
      dayKey,
      "bathCompletedAt must be preserved after /evening so late-night /bath does not re-send",
    );
    assert.strictEqual(
      state.metadata?.repliedToday,
      false,
      "repliedToday should be reset for the next day",
    );
  });

  await t.step("/bath skips when bathCompletedAt matches the reminder day", async () => {
    // /evening で保持された bathCompletedAt を getBathReminderDay() と一致させるため、
    // helper の算出と同じキーをセットして /bath が skipped になることを確認。
    const { getBathReminderDay } = await import("./helper.js");
    const dayKey = getBathReminderDay();
    await setUserState(userId, "ACTIVE", { bathCompletedAt: dayKey });

    const res = await cronApp.request("/bath", {
      headers: { Authorization: "Bearer test-secret" },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(
      body.pushed,
      false,
      "/bath should NOT push when bathCompletedAt matches the current reminder day",
    );
  });
});

Deno.test("cron /progress nudges an unreplied IDLE user", async (t) => {
  withMockEnv();
  const userId = "test_user_nudge";

  await t.step("shouldSendNoResponseNudge fires from lastProgressPushAt alone", () => {
    const fourHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    // 一度も返信していないが、最後の接触(朝の push)から 4h 以上経過 → nudge 対象
    assert.strictEqual(
      shouldSendNoResponseNudge(undefined, undefined, fourHoursAgo),
      true,
      "unreplied IDLE user should still get nudged after the silence window",
    );
    // 直近 1h の接触なら nudge しない
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(
      shouldSendNoResponseNudge(undefined, undefined, oneHourAgo),
      false,
      "recent contact should suppress the nudge",
    );
  });

  await t.step("/progress pushes NO_RESPONSE_NUDGE to a silent IDLE user", async () => {
    // withMockEnv() は TELEGRAM_USER_ID を test_user_evening に固定するため、
    // このテスト用に明示的に上書きする。
    Deno.env.set("TELEGRAM_USER_ID", "test_user_nudge");
    // 朝の push 時刻から 5h 経過、返信なし、nudge 未送信 → IDLE でも push されるはず
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    await setUserState("test_user_nudge", "IDLE", {
      lastProgressPushAt: fiveHoursAgo,
    });

    const res = await cronApp.request("/progress", {
      headers: { Authorization: "Bearer test-secret" },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(
      body.pushed,
      true,
      "silent IDLE user must still receive the no-response nudge",
    );
    assert.strictEqual(
      body.shouldNudge,
      true,
      "shouldNudge must be true for a silent IDLE user past the silence window",
    );
    assert.strictEqual(
      body.message,
      "今日の一歩は、小さくて大丈夫です。できそうなことを1つだけ試してみましょう。",
      "nudge message must be the NO_RESPONSE_NUDGE copy",
    );
  });
});

