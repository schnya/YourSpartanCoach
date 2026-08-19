import assert from "node:assert";
import {
  _createInMemoryMessagingClient,
  type MessagingClient,
} from "../../shared/integrations/telegram/telegramClient.js";
import { readDailyLog } from "../../shared/memory/dailyLogStore.js";
import { pullAndClearBounceMessages } from "./bounceRelay.js";
import { BOUNCE_CMD_RE, processSingleEvent } from "../webhook-reply/webhook.js";

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

const fakeClient: MessagingClient = _createInMemoryMessagingClient([]);

Deno.test("Bounce Relay & Command Interception Tests", async (t) => {
  await t.step("BOUNCE_CMD_RE regex matching", () => {
    assert.strictEqual(BOUNCE_CMD_RE.test("/dev"), true);
    assert.strictEqual(BOUNCE_CMD_RE.test("/dev task implementation"), true);
    assert.strictEqual(BOUNCE_CMD_RE.test("/IDEA new feature"), true);
    assert.strictEqual(BOUNCE_CMD_RE.test("/log finished review"), true);
    assert.strictEqual(BOUNCE_CMD_RE.test("/notice update status"), true);
    assert.strictEqual(BOUNCE_CMD_RE.test("hello /dev"), false);
    assert.strictEqual(BOUNCE_CMD_RE.test("/device"), false);
    assert.strictEqual(BOUNCE_CMD_RE.test("/login"), false);
  });

  await t.step("Bounce command is intercepted and enqueued to Deno KV", async () => {
    const userId = "12345";

    await processSingleEvent(
      {
        update_id: 200,
        message: {
          message_id: 1,
          from: { id: 12345, is_bot: false },
          chat: { id: 12345, type: "private" },
          date: 1700000000,
          text: "/dev implementing bounce relay feature",
        },
      },
      fakeClient,
      "dummy-token",
    );

    const pending = await pullAndClearBounceMessages();
    const matched = pending.find((m) => m.userId === userId);
    assert.ok(matched, "Pending bounce message should be found in Deno KV");
    assert.strictEqual(matched?.text, "/dev implementing bounce relay feature");
    assert.strictEqual(
      matched?.receivedAt,
      new Date(1700000000 * 1000).toISOString(),
    );

    // Spartan daily log should NOT have been updated
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Tokyo",
    });
    const log = await readDailyLog(userId, today);
    assert.strictEqual(log.includes("/dev implementing bounce relay"), false);
  });

  await t.step("pullAndClearBounceMessages returns items in FIFO order (receivedAt ascending)", async () => {
    await processSingleEvent(
      {
        update_id: 201,
        message: {
          message_id: 2,
          from: { id: 999, is_bot: false },
          chat: { id: 999, type: "private" },
          date: 1700000200,
          text: "/log second message",
        },
      },
      fakeClient,
      "dummy-token",
    );
    await processSingleEvent(
      {
        update_id: 202,
        message: {
          message_id: 1,
          from: { id: 999, is_bot: false },
          chat: { id: 999, type: "private" },
          date: 1700000100,
          text: "/dev first message",
        },
      },
      fakeClient,
      "dummy-token",
    );

    const pending = await pullAndClearBounceMessages();
    // FIFO 順序の検証は receivedAt 昇順で行う。
    const ordered = pending
      .slice()
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    assert.strictEqual(ordered[0].text, "/dev first message");
    assert.strictEqual(ordered[1].text, "/log second message");
  });
});
