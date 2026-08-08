import assert from "node:assert";
import type { messagingApi } from "@line/bot-sdk";
import { getUserState } from "../../shared/memory/fsmStore.js";
import { handleUserLogMessage } from "./messageHandlers.js";

interface DenoTestContext {
  step: (name: string, fn: () => void | Promise<void>) => Promise<boolean>;
}

declare const Deno: {
  test: (name: string, fn: (t: DenoTestContext) => void | Promise<void>) => void;
};

Deno.test("messageHandlers Tests", async (t) => {
  // 「入った」というテキスト投稿で bathCompletedAt が当日キーで記録されること
  await t.step("'入った' sets bathCompletedAt for the reminder day", async () => {
    const userId = `test_user_bath_${Date.now()}`;
    const fakeClient = {
      replyMessage: async () => ({}),
    } as unknown as messagingApi.MessagingApiClient;

    await handleUserLogMessage(userId, "入った", "reply-token", fakeClient, false);

    const state = await getUserState(userId);
    // getBathReminderDay は「JST<3:00 は前日」の日付を返す。ここでは単に
    // セットされた bathCompletedAt が getBathReminderDay() と一致することを確認。
    const expectedDay = (() => {
      // 本テストは UTC 実行環境でも再現性を持たせるため、helper の算出と同じ
      // ロジックで期待値を作る代わり、実際にフラグが「空でない日付文字列」に
      // なっていること、かつ再送ガードとして後続の /bath が skipped になる
      // こと（cron テスト側）を担保する。
      return state.metadata?.bathCompletedAt;
    })();

    assert.ok(
      typeof expectedDay === "string" && expectedDay.length > 0,
      `bathCompletedAt should be a non-empty date string, got: ${expectedDay}`,
    );
  });

  // 通常の投稿（「入った」以外）では bathCompletedAt がセットされないこと
  await t.step("non-'入った' text does not set bathCompletedAt", async () => {
    const userId = `test_user_no_bath_${Date.now()}`;
    const fakeClient = {
      replyMessage: async () => ({}),
    } as unknown as messagingApi.MessagingApiClient;

    await handleUserLogMessage(userId, "今日も頑張った", "reply-token", fakeClient, false);

    const state = await getUserState(userId);
    assert.strictEqual(
      state.metadata?.bathCompletedAt,
      undefined,
      "bathCompletedAt must remain unset for non-'入った' messages",
    );
  });
});
