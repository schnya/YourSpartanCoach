#!/usr/bin/env node
// @lat: [[memory#Daily Action Logs]]
//
// ローカルに pull 済みの本番日別ログ (memory/users/<userId>/logs/*.md) のうち、
// 保持期間を超えた古いファイルを削除してディスク・トークン消費を抑えるスクリプト。
// Upstash Redis がソースオブ・トゥルースのため、ローカルはキャッシュとして安全に削除可能。
// 依存ゼロ (Node 標準ライブラリ)。
//
// 使い方:
//   node scripts/pruneLogs.mjs                 # デフォルト 30 日超を削除
//   node scripts/pruneLogs.mjs --keep-days 14  # 14 日超を削除
//   node scripts/pruneLogs.mjs --dry-run       # 削除対象のみ表示 (削除しない)
//   node scripts/pruneLogs.mjs --user U048...  # 特定ユーザーのみ

import { readdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const usersDir = resolve(rootDir, "memory", "users");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
	const args = { keepDays: 30, dryRun: false, user: null };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--dry-run" || a === "-n") {
			args.dryRun = true;
		} else if (a === "--keep-days" || a === "-k") {
			const v = Number(argv[++i]);
			if (!Number.isFinite(v) || v < 0) {
				console.error(
					"[Error] --keep-days には 0 以上の数値を指定してください。",
				);
				process.exit(1);
			}
			args.keepDays = v;
		} else if (a === "--user" || a === "-u") {
			args.user = argv[++i];
		} else if (a === "--help" || a === "-h") {
			console.log(
				"Usage: node scripts/pruneLogs.mjs [--keep-days N] [--user <userId>] [--dry-run]",
			);
			process.exit(0);
		} else {
			console.error(`[Error] 不明な引数: ${a}`);
			process.exit(1);
		}
	}
	return args;
}

function dateFromFilename(name) {
	// Expected: YYYY-MM-DD.md
	const m = name.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
	if (!m) return null;
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	if (Number.isNaN(d.getTime())) return null;
	return d;
}

async function main() {
	const { keepDays, dryRun, user } = parseArgs(process.argv);

	let userEntries;
	try {
		userEntries = await readdir(usersDir, { withFileTypes: true });
	} catch {
		console.log(
			"[Info] memory/users ディレクトリが見つかりません。スキップします。",
		);
		return;
	}

	const now = Date.now();
	const cutoff = now - keepDays * MS_PER_DAY;

	let removedCount = 0;
	let removedBytes = 0;
	let skippedCount = 0;

	for (const ent of userEntries) {
		if (!ent.isDirectory()) continue;
		if (user && ent.name !== user) continue;

		const logsDir = join(usersDir, ent.name, "logs");
		let files;
		try {
			files = await readdir(logsDir);
		} catch {
			continue; // logs ディレクトリがなければスキップ
		}

		for (const f of files) {
			const fileDate = dateFromFilename(f);
			if (!fileDate) {
				skippedCount++;
				continue;
			}
			if (fileDate.getTime() >= cutoff) {
				skippedCount++;
				continue;
			}

			const full = join(logsDir, f);
			const info = await stat(full);
			removedBytes += info.size;
			removedCount++;

			if (dryRun) {
				console.log(
					`  [DryRun] would remove ${basename(usersDir)}/${ent.name}/logs/${f} (${(info.size / 1024).toFixed(1)} KB)`,
				);
			} else {
				await rm(full, { force: true });
				console.log(
					`  [Removed] ${ent.name}/logs/${f} (${(info.size / 1024).toFixed(1)} KB)`,
				);
			}
		}
	}

	const verb = dryRun ? "削除対象" : "削除済み";
	console.log(
		`\n[${dryRun ? "DryRun" : "Success"}] ${keepDays} 日超のログを ${verb}: ${removedCount} 件` +
			` / ${(removedBytes / 1024 / 1024).toFixed(2)} MB (保持: ${skippedCount} 件)`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
