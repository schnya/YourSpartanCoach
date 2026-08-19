import assert from "node:assert";
import { readDailyLog } from "../../shared/memory/dailyLogStore.js";
import {
  _createInMemoryMessagingClient,
  type MessagingClient,
} from "../../shared/integrations/telegram/telegramClient.js";
import webhookApp, { processSingleEvent } from "./webhook.js";

interface DenoTestContext {
  step: (name: string, fn: () => void | Promise<void>) => Promise<boolean>;
}

declare const Deno: {
  test: (name: string, fn: (t: DenoTestContext) => void | Promise<void>) => void;
  remove: (path: string) => Promise<void>;
};

const sentLog: { chatId: string; text: string }[] = [];
const fakeClient: MessagingClient = _createInMemoryMessagingClient(sentLog);

Deno.test("Telegram Webhook Endpoint & FP Handler Tests", async (t) => {
  // Test 1: Invalid JSON body returns 400
  await t.step("Invalid JSON body returns 400", async () => {
    const res = await webhookApp.request("/", {
      method: "POST",
      body: "{ invalid json",
    });
    assert.strictEqual(res.status, 400);
  });

  // Test 2: Non-Update payload returns 400
  await t.step("Non-Update payload returns 400", async () => {
    const res = await webhookApp.request("/", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
    });
    assert.strictEqual(res.status, 400);
  });

  // Test 3: Empty Update with valid shape returns 200 OK
  await t.step("Valid empty Update returns 200 OK", async () => {
    const res = await webhookApp.request("/", {
      method: "POST",
      body: JSON.stringify({ update_id: 1 }),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), "OK");
  });

  // Test 4: Single text event records exactly ONE [User Input] line (regression).
  await t.step("Single text event is logged once (no duplication)", async () => {
    const userId = "123";
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Tokyo",
    });
    const logPath = `./memory/users/${userId}/logs/${today}.md`;
    try {
      await Deno.remove(logPath);
    } catch {
      // file may not exist yet — fine
    }
    await processSingleEvent(
      {
        update_id: 100,
        message: {
          message_id: 1,
          from: { id: 123, is_bot: false },
          chat: { id: 123, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "些細なことでも驚くことにしました！",
        },
      },
      fakeClient,
      "dummy-token",
    );
    const log = await readDailyLog(userId, today);
    const userInputCount = (log.match(/\[User Input/g) || []).length;
    assert.strictEqual(
      userInputCount,
      1,
      `Expected exactly 1 [User Input] line, got ${userInputCount}:\n${log}`,
    );
  });
});
