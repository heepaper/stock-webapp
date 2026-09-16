---
name: summarizing-youtube-to-obsidian
description: Use when the user shares a YouTube URL and wants it summarized into their Obsidian vault, or asks to "요약해서 옵시디언에 저장", turn a video into a note, or save a YouTube summary as markdown.
---

# Summarizing YouTube to Obsidian

## Overview
Fetches a YouTube video's metadata + transcript (via the bundled `yt_to_obsidian.py`
script, using `yt-dlp`), summarizes it in Korean, and saves the result as an
Obsidian note with YAML frontmatter — no external API key needed, since the
calling agent does the summarization itself.

## When to Use
- User pastes/mentions a YouTube URL and asks for a summary, notes, or to save it to Obsidian
- User says things like "이 영상 요약해줘", "옵시디언에 정리해줘", "유튜브 노트 만들어줘"

Not for: videos without Korean or English captions (script will error out — report the
error to the user instead of guessing content from the title/thumbnail).

## Steps

1. **Run the script** to get metadata + transcript:
   ```
   python <this-skill-dir>/yt_to_obsidian.py "<youtube-url>"
   ```
   `<this-skill-dir>` is the directory this SKILL.md lives in. If the script exits
   with an error (no ko/en captions found), stop and relay the error message —
   do not attempt to summarize without a transcript.

2. **Read the transcript output** and write a Korean summary yourself (do not
   call any external API). Also pick a short core-topic phrase (2–5 Korean
   words, no spaces — join with `_`) that captures what the video is about;
   this becomes part of the filename.

   Check the `caption_type` field from the script output:
   - `manual` (creator-uploaded captions) → treat the transcript as reliable.
   - `auto` (speech-to-text) → treat proper nouns, numbers, and technical
     terms with suspicion — auto-captions frequently misrecognize these
     (e.g. "제미나이" → "재미나이", "0원" → "빵원", stutter artifacts like "이
     이"). Cross-check unusual/inconsistent terms against the video title
     before writing them into the summary, and prefer the title's spelling
     when they conflict. Add a one-line caveat right under the frontmatter:
     `> ⚠️ 자동 생성 자막 기반 — 일부 고유명사/숫자 오인식 가능성 있음`

3. **Determine the destination path.** The target vault is `<YOUR_VAULT_NAME>`
   (a separate git repo from this skill repo). First figure out whether you
   have **direct vault access** in this session:
   - PC: the vault exists locally at `D:\<path-to-your-vault>\<YOUR_VAULT_NAME>`
   - Any Claude Code session (including cloud/remote) that already has the
     `<YOUR_VAULT_NAME>` repo attached/cloned alongside this skill repo — check
     for it as a sibling checkout, or ask the user for its path if unsure
   - If neither applies (e.g. iPhone, where only this skill repo's
     project-scoped path is visible) → no direct access, see **Staging** below

   **With direct vault access:**
   1. Search the vault for a folder already named `<채널명>` — check
      `경제/03-유튜브/<채널명>/`, `Program/YouTube/<채널명>/`, and any other
      대주제's YouTube-summary subfolder. If found, write there — same
      location as existing notes for that channel. This is the common case
      for already-tracked channels.
   2. If no existing folder matches (genuinely new channel), don't guess a
      Finance/Useful split — this vault classifies by 분야 (topic domain),
      not by a finance/non-finance binary:
      - Clearly economy/market/finance content → create
        `경제/03-유튜브/<채널명>/`
      - Clearly programming/tech content → create `Program/YouTube/<채널명>/`
      - Otherwise, or if genuinely unsure → don't invent a new top-level
        location. Stage the note in `00-Inbox/` instead (the vault's own
        catch-all for unclassified content) and tell the user it needs
        manual triage, or ask the user which category fits.
   3. Follow the vault's **own** conventions for frontmatter — read
      `_templates/frontmatter-template.md` and
      `_templates/youtube-frontmatter-template.md` in the vault (don't assume
      the field list from memory; it's maintained in the vault, not here, and
      can change independently of this skill).
   4. `<채널명>` = the `channel` field from the script output, sanitized (see
      below). `<YYMMDD>` = the video's `upload_date`, last 6 digits. Create
      the channel subfolder if it doesn't already exist.

   **Staging (no direct vault access):** find this repo's root with
   `git rev-parse --show-toplevel`, then write to:
   ```
   <repo-root>/youtube-summaries/<채널명>/<YYMMDD>_<핵심주제>.md
   ```
   Use a minimal placeholder frontmatter here (`title`/`channel`/`url`/
   `upload_date`/`created`/`tags: [youtube]`) — this is a temporary staging
   format, not the vault's real schema, since the vault's own templates
   aren't reachable from here. After writing, `git add` + commit + push to
   `main` so it's available elsewhere via `git pull`. Tell the user the note
   is staged only (not in the real vault, not yet reformatted to vault
   conventions) and needs to be moved + reformatted later from a session that
   has direct vault access.
   If neither direct access nor a repo checkout is available, ask the user
   where to save instead of guessing.

   **Filename/folder sanitization**: strip any of `\ / : * ? " < > |` and
   trailing dots/spaces from the channel name and topic phrase (Windows
   forbids them in path segments).

4. **Write the note.**

   **With direct vault access**, use the frontmatter fields from
   `_templates/frontmatter-template.md` + `_templates/youtube-frontmatter-template.md`
   (currently: `분야`/`세부주제`/`태그`/`날짜`/`관련`/`유형`/`출처`/`원본링크`/`원제목`
   — but read those files rather than trusting this list, it can drift).
   Body:
   ```markdown
   ## TL;DR
   (2-3 sentence summary)

   ## 핵심 내용
   - (bullet key points)
   ```
   Do not add a "## 원본" or "## 관련 문서" body section — the `원본링크` and
   `관련` frontmatter fields already cover both. **Before considering the
   note done, check whether `_Summary_<채널명>.md` exists for this channel**
   (underscore prefix, inside the channel's own folder — see
   `_templates/youtube-frontmatter-template.md` for the exact convention) —
   if it does, the note's `관련` frontmatter MUST include
   `["[[_Summary_<채널명>]]"]`. Skipping this is the single most common
   mistake made with this skill.

   **Staging (no direct vault access)**, use the placeholder template from
   step 3 instead:
   ```markdown
   ---
   title: "<video title>"  # ALWAYS double-quote — a title starting with `'` or containing `:` breaks unquoted YAML
   channel: "<channel>"
   url: <original url>
   upload_date: <YYYY-MM-DD>
   created: <today's date, YYYY-MM-DD>
   tags: [youtube]
   ---

   ## TL;DR
   (2-3 sentence summary)

   ## 핵심 내용
   - (bullet key points)
   ```

5. **Update the channel's Summary doc, if one exists — only when you have
   direct vault access** (you can't check for or update a doc you can't see
   from a staging-only session). Do this automatically as part of the same
   turn — do not wait to be asked "summary도 업데이트했나?". For each note
   just written:
   - If `_Summary_<채널명>.md` doesn't exist yet, skip this step (don't
     create one unprompted — deep-dive Summary docs are created on explicit
     request).
   - If it exists, update it: bump frontmatter (`period` end date,
     `source_count`, `created`), add a timeline row for the new note(s),
     extend or add a numbered 핵심 인사이트 entry if the new content adds a
     genuinely new angle, and add the new note to 참고 문서.
   - Tell the user in your reply that you updated the Summary doc, so they
     don't have to ask.

## Common Mistakes
- Calling an external LLM API to summarize — don't; you (the calling agent) write the summary directly.
- Using the raw video title as the filename — the filename is `YYMMDD_핵심주제.md`, not the title.
- Skipping sanitization — channel names/topics can contain `:` or other characters Windows rejects in paths.
- Proceeding when the script errors on missing captions — report the error instead of fabricating a summary from the title alone.
- Adding a redundant "## 원본" or "## 관련 문서" body section — the `원본링크`/`관련` frontmatter fields already cover both; the backlink goes in frontmatter, not the body.
- Inventing a new top-level vault location for an unclear/new channel instead of routing to `00-Inbox` or asking — this vault classifies by 분야 (topic), not a finance/useful binary.
- Hardcoding the frontmatter field list from memory instead of reading `_templates/frontmatter-template.md` + `_templates/youtube-frontmatter-template.md` in the vault — it's maintained there, not in this skill, and can drift.
- Forgetting the `_Summary_<채널명>.md` backlink (note the underscore prefix) when it already exists for the channel — check for it every time, not just when it's obvious.
- Leaving the channel's Summary doc stale after writing new notes — update it in the same turn instead of waiting to be asked (only when you have direct vault access).
- Trusting `auto`-type captions at face value for names/numbers/terms — cross-check against the title instead of transcribing STT errors verbatim.
- Assuming "no hardcoded PC path found" means staging is required — also check whether the vault repo is otherwise directly accessible in this session (e.g. attached alongside this skill repo) before falling back to staging.
