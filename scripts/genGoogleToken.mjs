#!/usr/bin/env node
// @lat: [[memory#Google Tasks Integration]]
//
// Google Tasks 用の OAuth リフレッシュトークンを取得し、.env に書き込む。
// 依存ゼロ（Node 標準ライブラリ + fetch）。

import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");

function parseEnv(text) {
	const out = {};
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const idx = line.indexOf("=");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		let val = line.slice(idx + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1);
		}
		out[key] = val;
	}
	return out;
}

function setEnvValue(text, key, value) {
	const lines = text.split("\n");
	let replaced = false;
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^\s*([#]?\s*)?([A-Z0-9_]+)\s*=/);
		if (m && m[2] === key) {
			lines[i] = `${key}=${value}`;
			replaced = true;
			break;
		}
	}
	if (!replaced) lines.push(`${key}=${value}`);
	return lines.join("\n");
}

function getCodeFromHttpServer(port, pathName) {
	return new Promise((resolvePromise) => {
		const server = createServer((req, res) => {
			try {
				const url = new URL(req.url, `http://localhost:${port}`);
				const code = url.searchParams.get("code");
				if (code) {
					res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
					res.end("<h1>認証成功！</h1><p>ターミナルに戻ってください。</p>");
					server.close();
					resolvePromise(code);
				} else {
					res.writeHead(400, { "Content-Type": "text/plain" });
					res.end("No code param found");
				}
			} catch (e) {
				res.writeHead(500, { "Content-Type": "text/plain" });
				res.end("Internal error");
			}
		});
		server.listen(port, () => {});
		server.on("error", (err) => {
			console.warn(`[Warning] Local server listener warning on port ${port}: ${err.message}`);
		});
	});
}

function ask(question) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) =>
		rl.question(question, (ans) => {
			rl.close();
			resolve(ans.trim());
		}),
	);
}

async function main() {
	let text;
	try {
		text = await readFile(envPath, "utf-8");
	} catch {
		console.error(`[Error] .env not found at ${envPath}`);
		process.exit(1);
	}
	const env = parseEnv(text);

	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;

	if (!clientId || clientId.startsWith("your_")) {
		console.error(
			"[Error] GOOGLE_CLIENT_ID が未設定です。先に .env の GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を埋めてください。",
		);
		process.exit(1);
	}
	if (!clientSecret || clientSecret.startsWith("your_")) {
		console.error(
			"[Error] GOOGLE_CLIENT_SECRET が未設定です。先に .env を埋めてください。",
		);
		process.exit(1);
	}

	const redirectUri = env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.OAUTH_PORT || 8888}`;
	let port = 8888;
	let pathName = "/";
	try {
		const parsed = new URL(redirectUri);
		if (parsed.port) port = parseInt(parsed.port, 10);
		pathName = parsed.pathname || "/";
	} catch {
		// fallback
	}

	const SCOPES = ["https://www.googleapis.com/auth/tasks"];

	const authUrl =
		"https://accounts.google.com/o/oauth2/v2/auth?" +
		new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: SCOPES.join(" "),
			access_type: "offline",
			prompt: "consent",
		}).toString();

	console.log("\n=======================================================");
	console.log(`使用する Redirect URI: ${redirectUri}`);
	console.log("=======================================================\n");
	console.log("以下の URL をブラウザで開いて Google アカウントの同意を行ってください:\n");
	console.log(`${authUrl}\n`);
	console.log(`※ 【必須】Google Cloud Console の「承認済みのリダイレクト URI」に`);
	console.log(`   ${redirectUri}`);
	console.log(`   が正確に登録されている必要があります。登録されていない場合は redirect_uri_mismatch エラーになります。\n`);

	const codePromise = getCodeFromHttpServer(port, pathName);
	const askPromise = ask("自動待機中... 手動入力する場合は code または Redirect URL を貼り付けてください > ").then((raw) => {
		const match = raw.match(/[?&]code=([^&\s]+)/);
		return match ? decodeURIComponent(match[1]) : raw;
	});

	const code = await Promise.race([codePromise, askPromise]);

	if (!code) {
		console.error("[Error] コードが空です。");
		process.exit(1);
	}

	console.log("[Info] 認証コードを取得しました。トークンと交換中...");

	const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			grant_type: "authorization_code",
			redirect_uri: redirectUri,
		}),
	});

	if (!tokenRes.ok) {
		const errText = await tokenRes.text();
		console.error(
			`[Error] Token exchange failed: HTTP ${tokenRes.status} ${errText}`,
		);
		process.exit(1);
	}

	const token = await tokenRes.json();
	if (!token.refresh_token) {
		console.error(
			"[Error] refresh_token が返されませんでした。access_type=offline と prompt=consent が必要です（既にトークン発行済みの場合は、Google アカウントのアプリ連携を一度削除してください）。",
		);
		process.exit(1);
	}

	const newText = setEnvValue(
		text,
		"GOOGLE_REFRESH_TOKEN",
		token.refresh_token,
	);
	await writeFile(envPath, newText, "utf-8");

	console.log("\n[Success] GOOGLE_REFRESH_TOKEN を .env に保存しました。");
	console.log(`  access_token 有効期限: ${token.expires_in} 秒`);
	console.log("  GOOGLE_TASKS_LIST_ID は @default のままで問題ありません。");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
