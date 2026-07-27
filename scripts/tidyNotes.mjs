#!/usr/bin/env node
// Nightly vault hygiene for Smart Connections / RAG.
// Idempotent: ensures frontmatter (type/tags/status, plus user+date for logs)
// and a `## Related` wiki-link seed on memory/notes/** and memory/users/**/*.md.
// Never overwrites existing frontmatter values; never rewrites body content.
//
// Safe for ARES daily logs: the bot (src/services/memory/dailyLogStore.ts)
// appends to the file and regex-matches `## Scheduled Tasks`; it never assumes
// line 1 is the heading, and frontmatter uses single-line scalars (no `## `),
// so inserting YAML above `# Daily Log:` does not break parsing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEMORY = path.join(ROOT, "memory");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function hasFrontmatter(s) {
  return s.startsWith("---");
}

function extractFrontmatter(s) {
  const end = s.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = s.slice(3, end).trim();
  const fm = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

function inferNotesFrontmatter(content, fm) {
  const c = content;
  const tags = new Set();
  if (/カザフ|kazakh|Kazakh|Қарн|Бешбарма/i.test(c)) tags.add("language");
  if (/エージェント|agent|AI|LLM|ハーネス|guardrail|Guardrail/i.test(c)) tags.add("ai");
  if (/VC|業務委託|ポートフォリオ|ベンチャー|委託/i.test(c)) tags.add("business");
  if (/Qiita|開発|要件定義|インフラ|フロントエンド|バックエンド|設計/i.test(c)) tags.add("engineering");
  if (tags.size === 0) tags.add("note");
  const merged = { ...fm };
  if (merged.tags === undefined) merged.tags = `[${[...tags, "dev-seed"].join(", ")}]`;
  if (merged.status === undefined) merged.status = "evergreen";
  if (merged.type === undefined) merged.type = "note";
  return merged;
}

function inferUserLogFrontmatter(relPath, fm) {
  const m = relPath.match(/users[/]([^/]+)[/].*?([0-9]{4}-[0-9]{2}-[0-9]{2})\.md$/);
  const userId = m ? m[1] : "unknown";
  const date = m ? m[2] : "";
  const merged = { ...fm };
  if (merged.type === undefined) merged.type = "log";
  if (merged.tags === undefined) merged.tags = "[ares, daily-log]";
  if (merged.user === undefined && userId) merged.user = userId;
  if (merged.date === undefined && date) merged.date = date;
  return merged;
}

// Fixed key order; only keys with defined values are serialized.
const FM_ORDER = ["type", "status", "tags", "user", "date"];
function serializeFrontmatter(fm) {
  const lines = ["---"];
  for (const k of FM_ORDER) if (fm[k] !== undefined) lines.push(`${k}: ${fm[k]}`);
  lines.push("---", "");
  return lines.join("\n");
}

function ensureRelated(content, seedLinks) {
  if (/^##\s+Related\s*$/m.test(content)) return null; // already present
  const block = "\n## Related\n" + seedLinks.map((l) => `- ${l}`).join("\n") + "\n";
  return content.replace(/\s*$/, "") + block;
}

function tidyFile(absPath, relPath, kind) {
  let content = fs.readFileSync(absPath, "utf-8");
  if (content.trim() === "") return false;
  let changed = false;

  const fm = hasFrontmatter(content) ? extractFrontmatter(content) : {};
  const merged = kind === "user"
    ? inferUserLogFrontmatter(relPath, fm)
    : inferNotesFrontmatter(content, fm);
  const newKeys = FM_ORDER.filter((k) => fm[k] === undefined && merged[k] !== undefined);

  if (!hasFrontmatter(content) || newKeys.length) {
    const fmBlock = serializeFrontmatter(merged);
    if (!hasFrontmatter(content)) {
      content = fmBlock + content;
    } else {
      const end = content.indexOf("\n---", 3);
      content = fmBlock + content.slice(end + 4);
    }
    changed = true;
  }

  const seed = kind === "user"
    ? ["[[Obsidian運用方針]]", "[[USER_PROFILE]]"]
    : ["[[Obsidian運用方針]]", "[[長いMarkdownをそのまま毎回読み込ませない対処法]]"];
  const upd = ensureRelated(content, seed);
  if (upd !== null) {
    content = upd;
    changed = true;
  }

  if (changed) fs.writeFileSync(absPath, content, "utf-8");
  return changed;
}

const notesFiles = walk(path.join(MEMORY, "notes"));
const userFiles = walk(path.join(MEMORY, "users"));
let nChanged = 0;
for (const f of notesFiles) {
  if (tidyFile(f, path.relative(MEMORY, f), "notes")) nChanged++;
}
for (const f of userFiles) {
  if (tidyFile(f, path.relative(MEMORY, f), "user")) nChanged++;
}
console.log(`[tidyNotes] scanned ${notesFiles.length + userFiles.length} files, updated ${nChanged}.`);
