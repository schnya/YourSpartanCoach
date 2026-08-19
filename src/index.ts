import { Hono } from "hono";
import bounceRelayApp from "./features/bounce-relay/bounceRelay.js";
import cronApp from "./features/cron-push/cron.js";
import webhookApp from "./features/webhook-reply/webhook.js";

const app = new Hono();

// @lat: [[routing#Public Landing Page]]
app.get("/", (c) => {
	const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Spartan Coach — スパルタン・ライフコーチ</title>
</head>
<body>
  <main>
    <h1>Your Spartan Coach</h1>
    <p><strong>Your Spartan Coach</strong>（旧称 ARES: Automated Rigorous Execution System）は、Google カレンダー／タスクと連携し、LINE を通じて一日のタスクを優先順位付けし、進捗を確認しながら行動を促す AI ライフコーチ bot です。</p>
    <ul>
      <li>朝：Google Tasks の当日タスクを取得し、優先順位と行動経済学的な助言を LINE で push</li>
      <li>昼：タスクの増減や返信を検知し、必要なときだけ進捗確認を push</li>
      <li>夜：一日の取り組みを総括し、励ましや次の一歩を LINE で届ける</li>
    </ul>
    <p><a href="/privacy">プライバシーポリシー</a></p>
  </main>
</body>
</html>`;
	return c.html(html);
});

// @lat: [[routing#Public Landing Page]]
app.get("/privacy", (c) => {
	const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Spartan Coach — プライバシーポリシー</title>
</head>
<body>
  <main>
    <h1>プライバシーポリシー</h1>
    <p><strong>Your Spartan Coach</strong>（以下「本サービス」）は、利用者の LINE アカウントおよび Google アカウント（Google Tasks）と連携して動作します。</p>
    <h2>取得する情報</h2>
    <ul>
      <li>LINE のユーザー ID およびメッセージ送信履歴（本人確認と返信の記録のため）</li>
      <li>Google Tasks のタスク題名・メモ・期限（リマインドと優先順位付けのため）</li>
    </ul>
    <h2>利用目的</h2>
    <p>取得した情報は、本サービスの機能提供（タスク管理支援・通知）のみに使用し、第三者に共有・販売することはありません。</p>
    <h2>データの保管と削除</h2>
    <p>データは運用サーバーに保管され、利用停止を希望される場合はご連絡いただいた時点で削除対応いたします。</p>
    <h2>お問い合わせ</h2>
    <p>本ポリシーに関するお問い合わせは、サービス運営者までご連絡ください。</p>
  </main>
</body>
</html>`;
	return c.html(html);
});

// @lat: [[routing#Routing System]]
app.route("/telegram/webhook", webhookApp);
app.route("/cron", cronApp);
app.route("/api", bounceRelayApp);

export default app;
