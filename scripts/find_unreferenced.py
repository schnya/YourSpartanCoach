#!/usr/bin/env python3
"""Find source files under src/ that are not referenced from anywhere.

A file is considered "referenced" (alive) when ANY of these hold:
  1. It is reachable from an entry point (src/index.ts) via TS import edges.
  2. It is a *.test.ts file (run by the test runner by convention).
  3. A *.test.ts file imports it.
  4. Its path appears in a lat.md [[wiki link]] (e.g. [[src/foo.ts#sym]]).

Everything else under src/**/*.ts is reported as unreferenced so the user can
decide whether to delete it or wire it back in.

Reference detection is intentionally conservative: only relative imports
(./ or ../) are followed; external packages (hono, @line/bot-sdk, etc.) are
ignored. TS uses .js specifiers that resolve to .ts files, so those are mapped.

Usage:
    python3 scripts/find_unreferenced.py [repo_root]

repo_root defaults to $YOURSPARTANCOACH_REPO or the parent of this script's
directory.
"""

import os
import re
import subprocess
import sys
import json
from datetime import datetime
from pathlib import Path

SRC_DIRNAME = "src"
LAT_DIRNAME = "lat.md"
ENTRY = "src/index.ts"
REPORTS_DIRNAME = "reports"

# Relative import specifiers: from "..." / import "..." / import("...") / export ... from "..."
IMPORT_RE = re.compile(r'(?:from|import)\s*\(?\s*["\'](\.\.?/[^"\']+)["\']')
WIKILINK_RE = re.compile(r'\[\[([^\]]+)\]\]')

# Node analyzer that reports per-symbol dead exports via the TS compiler API.
ANALYZER = Path(__file__).resolve().parent / "analyze_exports.mjs"


def collect_dead_exports(repo_root: Path) -> list[dict]:
    """Run the TS-based dead-export analyzer and return a list of {file, name}.

    Returns [] if node/typescript is unavailable so the file-level check still
    runs. A non-zero exit or missing typescript is treated as "no data".
    """
    if not ANALYZER.exists():
        return []
    try:
        proc = subprocess.run(
            ["node", str(ANALYZER), str(repo_root)],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []
    if proc.returncode != 0:
        return []
    try:
        data = json.loads(proc.stdout)
    except (json.JSONDecodeError, ValueError):
        return []
    return data.get("deadExports", [])


def resolve_spec(importer: Path, spec: str, src_root: Path) -> Path | None:
    """Resolve a relative import specifier to an existing .ts file, or None."""
    raw = spec.split("?", 1)[0].split("#", 1)[0]
    base = importer.parent
    candidate = (base / raw).resolve()
    tries = []
    if candidate.suffix == ".js":
        tries.append(candidate.with_suffix(".ts"))
    elif candidate.suffix == ".ts":
        tries.append(candidate)
    else:
        tries.append(candidate.with_suffix(".ts"))
        tries.append(candidate / "index.ts")
    for t in tries:
        if t.exists() and t.is_file():
            try:
                return t.relative_to(src_root.resolve())
            except ValueError:
                return None
    return None


def collect_ts_files(src_root: Path):
    return sorted(p for p in src_root.rglob("*.ts") if p.is_file())


def build_import_graph(src_root: Path):
    """Return (edges, test_files). edges: dict[relative_path -> set(targets)]."""
    src_root = src_root.resolve()  # normalize so .resolve() on both sides matches
    edges: dict[Path, set[Path]] = {}
    test_files: set[Path] = set()
    for f in collect_ts_files(src_root):
        rel = f.resolve().relative_to(src_root)
        if rel.name.endswith(".test.ts"):
            test_files.add(rel)
        edges.setdefault(rel, set())
        try:
            text = f.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for spec in IMPORT_RE.findall(text):
            tgt = resolve_spec(f, spec, src_root)
            if tgt is not None:
                edges[rel].add(tgt)
    return edges, test_files


def lat_referenced_files(repo_root: Path, src_root: Path):
    """Return set of src-relative paths referenced by lat.md wiki links."""
    referenced: set[Path] = set()
    lat_root = repo_root / LAT_DIRNAME
    if not lat_root.exists():
        return referenced
    for md in lat_root.rglob("*.md"):
        try:
            text = md.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for link in WIKILINK_RE.findall(text):
            target = link.split("|", 1)[0].strip()
            # Source code links look like src/foo.ts or src/foo.ts#symbol
            if target.startswith("src/") and not target.startswith("src//"):
                stripped = target.split("#", 1)[0]
                # target already carries the "src/" prefix, so base is the repo root.
                cand = (repo_root / stripped).resolve()
                if cand.exists() and cand.is_file():
                    try:
                        referenced.add(cand.relative_to(src_root.resolve()))
                    except ValueError:
                        pass
    return referenced


def reachable_from(seeds: set[Path], edges: dict[Path, set[Path]]) -> set[Path]:
    seen: set[Path] = set()
    stack = list(seeds)
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        for nxt in edges.get(cur, ()):
            if nxt not in seen:
                stack.append(nxt)
    return seen


def main() -> int:
    repo_root = Path(
        os.environ.get("YOURSPARTANCOACH_REPO")
        or os.environ.get("ARESPATH")
        or str(Path(__file__).resolve().parent.parent)
    ).resolve()
    src_root = repo_root / SRC_DIRNAME
    if not src_root.exists():
        print(f"ERROR: src directory not found at {src_root}", file=sys.stderr)
        return 2

    edges, test_files = build_import_graph(src_root)
    lat_refs = lat_referenced_files(repo_root, src_root)

    # Graph keys are relative to src_root, so the entry is "index.ts" (no src/ prefix).
    entry = Path("index.ts")
    seeds: set[Path] = set()
    if entry in edges:
        seeds.add(entry)
    seeds |= test_files
    # NOTE: lat.md wiki-links are treated as *annotations* only, NOT as alive
    # seeds. A file referenced solely by stale docs is exactly the kind of dead
    # code we want surfaced — the doc may be wrong. Code reachability decides.

    alive = reachable_from(seeds, edges)

    all_files = set(edges.keys())
    dead_files = sorted(all_files - alive)

    # Test files are alive by convention; never report them as dead.
    dead_files = [p for p in dead_files if p not in test_files]

    # --- Dead exports (per-symbol reachability via the TS compiler API) ---
    dead_exports = collect_dead_exports(repo_root)

    if not dead_files and not dead_exports:
        # Silent when clean (watchdog pattern): nothing to decide.
        return 0

    lines = []
    lines.append("🧹 どこからも参照されていないコードが見つかりました")
    lines.append("（削除するか、使うよう修正するかはあなたが決めてください）")
    lines.append("")

    if dead_files:
        lines.append("【ファイル】")
        for p in dead_files:
            notes = []
            if p not in edges.get(entry, set()) and p != entry:
                notes.append("entry から到達不可")
            if p in lat_refs:
                notes.append("lat.md のみ参照（実コード未参照）")
            note = "（" + "、".join(notes) + "）" if notes else ""
            lines.append(f"  • src/{p.as_posix()}{note}")
        lines.append("")

    if dead_exports:
        # group by file
        by_file: dict[str, list[str]] = {}
        for e in dead_exports:
            by_file.setdefault(e["file"], []).append(e["name"])
        lines.append("【export されてるのに未使用のシンボル】")
        for f, names in sorted(by_file.items()):
            lat_only = any(
                Path(f).as_posix() in {r.as_posix() for r in lat_refs}
                for _ in names
            )
            extra = "（lat.md のみ参照）" if lat_only else ""
            lines.append(
                f"  • {f}  ::  " + ", ".join(names) + extra
            )
        lines.append("")

    lines.append(
        f"合計: ファイル {len(dead_files)} 件、未使用 export {len(dead_exports)} 件。"
    )

    report_body = build_report_markdown(dead_files, dead_exports, lat_refs, edges, entry)
    report_path = write_report(repo_root, report_body)

    if report_path:
        lines.append("")
        lines.append(f"📄 レポート保存: {report_path}")
    print("\n".join(lines))
    return 0


def build_report_markdown(dead_files, dead_exports, lat_refs, edges, entry) -> str:
    """Render a standalone markdown report of the dead-code findings."""
    now = datetime.now()
    out = []
    out.append(f"# 未参照コード レポート")
    out.append("")
    out.append(f"- 生成日時: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    out.append(f"- 未参照ファイル: {len(dead_files)} 件")
    out.append(f"- 未使用 export: {len(dead_exports)} 件")
    out.append("")
    out.append(
        "> 削除するか、使うよう修正するかはあなたが決めてください。"
    )
    out.append("")

    if dead_files:
        out.append("## 未参照ファイル")
        out.append("")
        out.append("| ファイル | 備考 |")
        out.append("| --- | --- |")
        for p in dead_files:
            notes = []
            if p not in edges.get(entry, set()) and p != entry:
                notes.append("entry から到達不可")
            if p in lat_refs:
                notes.append("lat.md のみ参照（実コード未参照）")
            note = "、".join(notes) if notes else "-"
            out.append(f"| `src/{p.as_posix()}` | {note} |")
        out.append("")

    if dead_exports:
        by_file: dict[str, list[str]] = {}
        for e in dead_exports:
            by_file.setdefault(e["file"], []).append(e["name"])
        out.append("## 未使用の export シンボル")
        out.append("")
        out.append("| ファイル | シンボル | 備考 |")
        out.append("| --- | --- | --- |")
        for f, names in sorted(by_file.items()):
            lat_only = any(
                Path(f).as_posix() in {r.as_posix() for r in lat_refs}
                for _ in names
            )
            extra = "lat.md のみ参照" if lat_only else "-"
            out.append(f"| `{f}` | `{', '.join(names)}` | {extra} |")
        out.append("")

    return "\n".join(out)


def write_report(repo_root: Path, body: str) -> Path | None:
    """Persist the report under reports/ with a timestamped filename.

    Returns the relative path (from repo root) on success, or None on failure.
    """
    try:
        reports_dir = repo_root / REPORTS_DIRNAME
        reports_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d")
        path = reports_dir / f"dead-code-{stamp}.md"
        # Append if a report for today already exists; otherwise create.
        mode = "a" if path.exists() else "w"
        with path.open(mode, encoding="utf-8") as fh:
            if mode == "a":
                fh.write("\n---\n\n")
            fh.write(body)
        return path.relative_to(repo_root)
    except OSError:
        return None


if __name__ == "__main__":
    sys.exit(main())
