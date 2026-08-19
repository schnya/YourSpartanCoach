import assert from "node:assert";
import { getUserState } from "../../shared/memory/fsmStore.js";
import {
  _createInMemoryMessagingClient,
  type MessagingClient,
} from "../../shared/integrations/telegram/telegramClient.js";
import { handleUserLogMessage } from "./messageHandlers.js";

interface DenoTestContext {
  step: (name: string, fn: () => void | Promise<void>) => Promise<boolean>;
}

declare const Deno: {
  test: (name: string, fn: (t: DenoTestContext) => void | Promise<void>) => void;
};

const sentLog: { chatId: string; text: string }[] = [];
const fakeClient: MessagingClient = _createInMemoryMessagingClient(sentLog);

Deno.test("messageHandlers Tests", async (t) => {
  // 「入った」というテキスト投稿で bathCompletedAt が当日キーで記録されること
  await t.step("'入った' sets bathCompletedAt for the reminder day", async () => {
    const userId = `test_user_bath_${Date.now()}`;
    await handleUserLogMessage(userId, "chat-1", "入った", fakeClient, false);

    const state = await getUserState(userId);
    const expectedDay = state.metadata?.bathCompletedAt;

    assert.ok(
      typeof expectedDay === "string" && expectedDay.length > 0,
      `bathCompletedAt should be a non-empty date string, got: ${expectedDay}`,
    );
  });

  // 通常の投稿（「入った」以外）では bathCompletedAt がセットされないこと
  await t.step("non-'入った' text does not set bathCompletedAt", async () => {
    const userId = `test_user_no_bath_${Date.now()}`;
    await handleUserLogMessage(
      userId,
      "chat-2",
      "今日も頑張った",
      fakeClient,
      false,
    );

    const state = await getUserState(userId);
    assert.strictEqual(
      state.metadata?.bathCompletedAt,
      undefined,
      "bathCompletedAt must remain unset for non-'入った' messages",
    );
  });
});
