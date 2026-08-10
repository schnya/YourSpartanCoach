import assert from "node:assert";
import { getUserState, setUserState } from "../../shared/memory/fsmStore.js";
import cronApp from "./cron.js";

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

//  env をモックして CRON_SECRET 認証と LINE push を通す
const OLD_ENV = Deno.env.toObject?.() ?? {};
function withMockEnv() {
  Deno.env.set("CRON_SECRET", "test-secret");
  Deno.env.set("LINE_CHANNEL_ACCESS_TOKEN", "");
  Deno.env.set("LINE_USER_ID", "test_user_evening");
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
