#!/usr/bin/env python3
"""Deterministic, read-only health check for an Obsidian vault.

No external dependencies (stdlib only). Reports facts; never edits files.

Usage:
    python3 wiki_lint.py <vault_path> [--format text|markdown] [--strict]
"""
import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

# Directories that are never scanned as content (infra / non-note output)
HARD_EXCLUDE_DIRS = {".obsidian", ".git", "graphify-out"}

# Directories that are valid link *targets* but skipped as lint *subjects*
# (their content is placeholder/staging/raw material, not a finished note)
SOFT_EXCLUDE_DIRS = {"_templates", "00-Inbox", "01-Clippings", "_Keep_Original"}

# Directories whose links are not resolved for dead-link checking either,
# since they intentionally contain placeholder syntax (e.g. <채널명>)
LINK_SCAN_EXCLUDE_DIRS = {"_templates"}

REQUIRED_COMMON = ["분야", "세부주제", "태그", "날짜", "관련"]
REQUIRED_YOUTUBE_VIDEO = ["유형", "출처", "원본링크", "원제목"]
REQUIRED_YOUTUBE_COMMUNITY = ["출처", "원본링크", "작성자"]
ARRAY_FIELDS = {"세부주제", "태그", "관련"}

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)
FM_KEY_RE = re.compile(r"^([A-Za-z0-9가-힣_]+):\s*(.*)$")
CODEBLOCK_RE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
LINK_RE = re.compile(r"(!)?\[\[([^\]|#]*)(#[^\]|]*)?(\|[^\]]*)?\]\]")


def rel(p: Path, root: Path) -> str:
    return str(p.relative_to(root)).replace("\\", "/")


def is_excluded(rel_path: str, exclude_set: set) -> bool:
    top = rel_path.split("/")[0]
    return top in exclude_set


def parse_frontmatter(text: str) -> dict:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    fm, key = {}, None
    for line in m.group(1).split("\n"):
        km = FM_KEY_RE.match(line)
        if km:
            key = km.group(1)
            fm[key] = km.group(2).strip()
        elif key and (line.startswith(" ") or line.startswith("\t")) and fm.get(key) == "":
            fm[key] = "(list)"
    return fm


def strip_noise(text: str) -> str:
    """Remove fenced/inline code so example syntax isn't mistaken for real links,
    and unescape "\\|" (pipe escaped to survive inside a Markdown table cell)."""
    text = CODEBLOCK_RE.sub("", text)
    text = INLINE_CODE_RE.sub("", text)
    text = text.replace("\\|", "|")
    return text


def build_indices(vault_root: Path):
    all_files, md_files = [], []
    for p in vault_root.rglob("*"):
        if not p.is_file():
            continue
        r = rel(p, vault_root)
        if is_excluded(r, HARD_EXCLUDE_DIRS):
            continue
        all_files.append(p)
        if p.suffix == ".md":
            md_files.append(p)

    file_index = defaultdict(list)       # exact filename -> [Path]
    md_stem_index = defaultdict(list)    # md stem (no ext) -> [Path]
    for p in all_files:
        file_index[p.name].append(p)
    for p in md_files:
        md_stem_index[p.stem].append(p)
    return all_files, md_files, file_index, md_stem_index


def resolve_target(target: str, vault_root: Path, file_index, md_stem_index, source_dir: Path = None):
    t = target.strip()
    if not t:
        return None  # same-note heading link, always fine
    if "/" in t:
        candidates, seen = [], set()
        if t.startswith("../") or t.startswith("./") or "/../" in t:
            # Explicit relative navigation ("../folder/note") - resolve
            # against the linking file's own folder.
            if source_dir is None:
                return []
            try:
                resolved = (source_dir / t).resolve()
            except OSError:
                return []
            target_r = rel(resolved, vault_root)
            variants = {target_r} if Path(target_r).suffix else {target_r, target_r + ".md"}
            for paths in file_index.values():
                for p in paths:
                    if rel(p, vault_root) in variants and p not in seen:
                        candidates.append(p)
                        seen.add(p)
            return candidates
        # Otherwise: Obsidian resolves an ambiguous short link by matching
        # the SUFFIX of a file's full vault path (its "shortest unique
        # path" behavior) - not literally relative to vault root or to
        # the current file.
        norm = t.strip("/")
        seg_variants = [norm.split("/")]
        if not Path(norm).suffix:
            seg_variants.append((norm + ".md").split("/"))
        for paths in file_index.values():
            for p in paths:
                segs = rel(p, vault_root).split("/")
                if p in seen:
                    continue
                for sv in seg_variants:
                    if len(segs) >= len(sv) and segs[-len(sv):] == sv:
                        candidates.append(p)
                        seen.add(p)
                        break
        return candidates
    if Path(t).suffix:
        return list(file_index.get(t, []))
    return list(md_stem_index.get(t, []))


def find_links(md_files, vault_root, file_index, md_stem_index):
    """Returns (dead, ambiguous, incoming_count) where incoming_count maps
    resolved target Path -> number of distinct linking notes."""
    dead, ambiguous = [], []
    incoming = defaultdict(int)
    for p in md_files:
        r = rel(p, vault_root)
        if is_excluded(r, LINK_SCAN_EXCLUDE_DIRS):
            continue
        text = strip_noise(p.read_text(encoding="utf-8", errors="replace"))
        seen_targets_this_file = set()
        for m in LINK_RE.finditer(text):
            target = m.group(2)
            candidates = resolve_target(target, vault_root, file_index, md_stem_index, source_dir=p.parent)
            if candidates is None:
                continue
            if len(candidates) == 0:
                dead.append((r, target.strip()))
            elif len(candidates) > 1:
                ambiguous.append((r, target.strip(), [rel(c, vault_root) for c in candidates]))
            else:
                key = candidates[0]
                if key not in seen_targets_this_file:
                    incoming[key] += 1
                    seen_targets_this_file.add(key)
    return dead, ambiguous, incoming


def find_orphans(md_files, vault_root, incoming):
    orphans = []
    for p in md_files:
        r = rel(p, vault_root)
        if is_excluded(r, SOFT_EXCLUDE_DIRS | HARD_EXCLUDE_DIRS):
            continue
        if p.name == "_index.md" or p.name.startswith("_Summary_"):
            continue
        if incoming.get(p, 0) == 0:
            orphans.append(r)
    return sorted(orphans)


def find_frontmatter_gaps(md_files, vault_root):
    gaps = []
    for p in md_files:
        r = rel(p, vault_root)
        if is_excluded(r, SOFT_EXCLUDE_DIRS | HARD_EXCLUDE_DIRS):
            continue
        if p.name in ("_index.md",):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        fm = parse_frontmatter(text)
        if not fm:
            gaps.append((r, ["(frontmatter 없음)"]))
            continue
        # _Summary_*.md hub docs are structurally exempt from 관련/원본링크:
        # they synthesize many sources rather than backlinking to one, so
        # there's nothing for these fields to point at.
        is_summary_hub = p.name.startswith("_Summary_")
        required_common = [k for k in REQUIRED_COMMON if not (is_summary_hub and k == "관련")]
        missing = [k for k in required_common if k not in fm]
        for k in required_common:
            if k in fm and k not in ARRAY_FIELDS and fm[k] in ("", '""'):
                missing.append(f"{k}(비어있음)")
        is_youtube = "/03-유튜브/" in f"/{r}" or "/YouTube/" in f"/{r}" or fm.get("출처", "").startswith("youtube")
        if is_youtube:
            # Community posts (출처: youtube-community) use a different
            # required-field set than video summaries (원제목/유형 don't
            # apply - there's no video title, use 작성자 instead).
            required = REQUIRED_YOUTUBE_COMMUNITY if fm.get("출처") == "youtube-community" else REQUIRED_YOUTUBE_VIDEO
            if is_summary_hub:
                required = [k for k in required if k != "원본링크"]
            for k in required:
                if k not in fm:
                    missing.append(k)
                elif fm[k] in ("", '""'):
                    missing.append(f"{k}(비어있음)")
        if missing:
            gaps.append((r, missing))
    return gaps


def find_summary_gaps(vault_root):
    """For every folder containing a _Summary_*.md, check that each video
    note in that folder (or its subfolders) is referenced somewhere in it."""
    results = []
    for summary_path in vault_root.rglob("_Summary_*.md"):
        folder = summary_path.parent
        summary_text = summary_path.read_text(encoding="utf-8", errors="replace")
        missing = []
        for note in folder.rglob("*.md"):
            if note == summary_path or note.name.startswith("_"):
                continue
            if note.stem not in summary_text:
                missing.append(rel(note, vault_root))
        if missing:
            results.append((rel(summary_path, vault_root), sorted(missing)))
    return results


def render(dead, ambiguous, orphans, gaps, summary_gaps, fmt: str) -> str:
    lines = []
    total = len(dead) + len(ambiguous) + len(orphans) + len(gaps) + sum(len(m) for _, m in summary_gaps)
    h = (lambda s: f"## {s}") if fmt == "markdown" else (lambda s: f"=== {s} ===")

    lines.append(h(f"wiki-lint 결과 (findings: {total})"))

    lines.append(h(f"깨진 위키링크 ({len(dead)})"))
    for src, target in dead:
        lines.append(f"- {src} -> [[{target}]]")

    lines.append(h(f"모호한 위키링크 ({len(ambiguous)})"))
    for src, target, cands in ambiguous:
        lines.append(f"- {src} -> [[{target}]] : {', '.join(cands)}")

    lines.append(h(f"고아 노트 ({len(orphans)})"))
    for r in orphans:
        lines.append(f"- {r}")

    lines.append(h(f"frontmatter 필드 누락 ({len(gaps)})"))
    for r, missing in gaps:
        lines.append(f"- {r} : {', '.join(missing)}")

    lines.append(h(f"채널 Summary에 언급 안 된 노트 ({sum(len(m) for _, m in summary_gaps)})"))
    for summary_r, missing in summary_gaps:
        lines.append(f"- {summary_r}")
        for r in missing:
            lines.append(f"  - {r}")

    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("vault", nargs="?", default=".", help="vault root path")
    ap.add_argument("--format", choices=["text", "markdown"], default="text")
    ap.add_argument("--strict", action="store_true", help="exit 1 if any findings")
    args = ap.parse_args()

    vault_root = Path(args.vault).resolve()
    all_files, md_files, file_index, md_stem_index = build_indices(vault_root)
    dead, ambiguous, incoming = find_links(md_files, vault_root, file_index, md_stem_index)
    orphans = find_orphans(md_files, vault_root, incoming)
    gaps = find_frontmatter_gaps(md_files, vault_root)
    summary_gaps = find_summary_gaps(vault_root)

    print(render(dead, ambiguous, orphans, gaps, summary_gaps, args.format))

    total = len(dead) + len(ambiguous) + len(orphans) + len(gaps) + sum(len(m) for _, m in summary_gaps)
    if args.strict and total > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
