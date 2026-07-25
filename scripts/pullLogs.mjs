#!/usr/bin/env node
// @lat: [[memory#Daily Action Logs]]
//
// Deno Deploy (本番環境) の Upstash Redis に保存されている日別ログ (.md) を
// ローカルの memory/users/<userId>/logs/<dateStr>.md へ一括取得・同期するスクリプト。
// 依存ゼロ (Node 標準ライブラリ + fetch)。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const envPath = resolve(rootDir, ".env");

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

async function main() {
	let envText;
	try {
		envText = await readFile(envPath, "utf-8");
	} catch {
		console.error(`[Error] .env ファイルが見つかりません (${envPath})`);
		process.exit(1);
	}
	const env = parseEnv(envText);

	const url = env.UPSTASH_REDIS_REST_URL;
	const token = env.UPSTASH_REDIS_REST_TOKEN;

	if (!url || !token) {
		console.error(
			"[Error] UPSTASH_REDIS_REST_URL または UPSTASH_REDIS_REST_TOKEN が .env に設定されていません。",
		);
		process.exit(1);
	}

	console.log("[Info] Upstash Redis からログキーを検索中...");

	const res = await fetch(`${url}/keys/user:*:log:*`, {
		headers: { Authorization: `Bearer ${token}` },
	});

	if (!res.ok) {
		const errText = await res.text();
		console.error(`[Error] Upstash API エラー: HTTP ${res.status} - ${errText}`);
		process.exit(1);
	}

	const data = await res.json();
	const keys = data.result || [];

	if (keys.length === 0) {
		console.log("[Info] Redis 上に保存された日別ログキーは見つかりませんでした。");
		return;
	}

	console.log(`[Info] ${keys.length} 件のログキーを発見しました。ローカルへ取得・保存中...\n`);

	for (const key of keys) {
		// Key format: user:<userId>:log:<dateStr>
		const parts = key.split(":");
		if (parts.length < 4) continue;
		const userId = parts[1];
		const dateStr = parts[3];

		const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!getRes.ok) continue;

		const getJson = await getRes.json();
		const content = getJson.result;
		if (!content) continue;

		const userLogsDir = resolve(rootDir, "memory", "users", userId, "logs");
		await mkdir(userLogsDir, { recursive: true });
		const logPath = resolve(userLogsDir, `${dateStr}.md`);

		await writeFile(logPath, content, "utf-8");
		console.log(`  [Saved] ${key} -> memory/users/${userId}/logs/${dateStr}.md`);
	}

	console.log("\n[Success] すべての日別ログ (.md) の同期が完了しました。");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
