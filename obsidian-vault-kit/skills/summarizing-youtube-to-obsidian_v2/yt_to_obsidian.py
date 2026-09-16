#!/usr/bin/env python3
"""Fetch a YouTube video's metadata and transcript so Claude Code can summarize it
into an Obsidian note. This script does not summarize anything itself - it only
prints the raw material (metadata + transcript text) to stdout.
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

SUBTITLE_LANGS = ("ko", "en")


def run_yt_dlp_json(url: str) -> dict:
    result = subprocess.run(
        ["yt-dlp", "-J", "--no-warnings", url],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"[오류] 메타데이터를 가져오지 못했습니다:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return json.loads(result.stdout)


def vtt_to_text(vtt_path: Path) -> str:
    """Convert a VTT file to text, prefixing each retained line with the
    [MM:SS] timestamp of the caption cue it first appeared in. Auto-generated
    captions often scroll (re-showing prior lines in each cue), so lines are
    deduped globally and keep only their first-seen timestamp.
    """
    cue_start_re = re.compile(r"^(\d{2}):(\d{2}):(\d{2})[.,]\d{3}\s*-->")
    tag_re = re.compile(r"<[^>]+>")
    header_re = re.compile(r"^(Kind|Language):", re.IGNORECASE)
    lines = []
    seen = set()
    current_ts = None
    for raw in vtt_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        m = cue_start_re.match(line)
        if m:
            h, mm, s = int(m.group(1)), int(m.group(2)), int(m.group(3))
            current_ts = h * 3600 + mm * 60 + s
            continue
        if current_ts is None:
            continue
        if not line or line == "WEBVTT" or line.isdigit() or header_re.match(line):
            continue
        line = tag_re.sub("", line).strip()
        if not line or line in seen:
            continue
        seen.add(line)
        mm, ss = divmod(current_ts, 60)
        lines.append(f"[{mm:02d}:{ss:02d}] {line}")
    return "\n".join(lines)


def pick_caption_lang_and_type(info: dict):
    """Prefer manual (creator-uploaded) captions over auto-generated ones,
    checking languages in SUBTITLE_LANGS order. Returns (lang, type) or
    (None, None) if nothing usable is available.
    """
    manual = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    for lang in SUBTITLE_LANGS:
        if lang in manual:
            return lang, "manual"
    for lang in SUBTITLE_LANGS:
        if lang in auto:
            return lang, "auto"
    return None, None


def fetch_subtitles(url: str, workdir: Path, lang: str, caption_type: str):
    sub_flag = "--write-sub" if caption_type == "manual" else "--write-auto-sub"
    subprocess.run(
        [
            "yt-dlp", "--skip-download", sub_flag,
            "--sub-lang", lang, "--sub-format", "vtt",
            "-o", str(workdir / "%(id)s.%(ext)s"),
            "--no-warnings", url,
        ],
        capture_output=True, text=True,
    )
    vtt_files = list(workdir.glob(f"*.{lang}.vtt"))
    if not vtt_files:
        return None
    return vtt_to_text(vtt_files[0])


def main():
    parser = argparse.ArgumentParser(description="Fetch YouTube metadata + transcript for an Obsidian summary.")
    parser.add_argument("url", help="YouTube video URL")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        info = run_yt_dlp_json(args.url)
        lang, caption_type = pick_caption_lang_and_type(info)

        if lang is None:
            print("[오류] 이 영상에는 한국어/영어 자막이 없어 요약할 수 없습니다.", file=sys.stderr)
            sys.exit(1)

        transcript = fetch_subtitles(args.url, workdir, lang, caption_type)
        if transcript is None:
            print("[오류] 자막 파일을 받아오지 못했습니다.", file=sys.stderr)
            sys.exit(1)

        print("=== METADATA ===")
        print(f"title: {info.get('title')}")
        print(f"channel: {info.get('channel') or info.get('uploader')}")
        print(f"upload_date: {info.get('upload_date')}")  # YYYYMMDD
        print(f"url: {args.url}")
        print(f"subtitle_lang: {lang}")
        print(f"caption_type: {caption_type}")  # manual (creator-uploaded) or auto (speech-to-text)
        print("=== TRANSCRIPT ===")
        print(transcript)


if __name__ == "__main__":
    main()
