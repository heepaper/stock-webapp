#!/usr/bin/env python3
"""BM25 keyword search over an Obsidian vault (no embeddings, no API calls).

Pure Python stdlib only - no pip install required anywhere it runs.

Usage:
    python3 bm25_search.py <vault_path> "<query>" [--top-k N] [--snippet-len N]
"""
import argparse
import math
import re
import sys
from pathlib import Path

HARD_EXCLUDE_DIRS = {".obsidian", ".git", "graphify-out"}
FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)
CJK_RE = re.compile(r"[가-힣ㄱ-ㆎ]")  # Hangul syllables + jamo
WORD_RE = re.compile(r"[가-힣ㄱ-ㆎA-Za-z0-9]+")

K1, B = 1.5, 0.75
TITLE_BOOST = 3  # repeat title tokens this many times so title matches score higher


def rel(p: Path, root: Path) -> str:
    return str(p.relative_to(root)).replace("\\", "/")


def load_ignore_patterns(vault_root: Path):
    """Reuse .graphifyignore so sensitive/non-content paths stay excluded here too."""
    patterns = []
    ignore_file = vault_root / ".graphifyignore"
    if ignore_file.exists():
        for line in ignore_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                patterns.append(line)
    return patterns


def is_ignored(rel_path: str, patterns) -> bool:
    top = rel_path.split("/")[0]
    if top in HARD_EXCLUDE_DIRS:
        return True
    for pat in patterns:
        if pat.endswith("/"):
            if rel_path.startswith(pat) or (rel_path + "/").startswith(pat):
                return True
        elif pat.startswith("*."):
            if rel_path.endswith(pat[1:]):
                return True
        elif rel_path == pat:
            return True
    return False


def tokenize(text: str):
    """Hybrid tokenizer: CJK spans become character bigrams (Korean has no
    whitespace word boundaries the way English does), non-CJK spans (English
    words, numbers, tickers) are kept as whole lowercased tokens."""
    tokens = []
    for w in WORD_RE.findall(text):
        if CJK_RE.search(w):
            if len(w) == 1:
                tokens.append(w)
            else:
                tokens.extend(w[i:i + 2] for i in range(len(w) - 1))
        else:
            tokens.append(w.lower())
    return tokens


def parse_frontmatter(text: str):
    m = FRONTMATTER_RE.match(text)
    return m.group(1) if m else ""


def build_corpus(vault_root: Path):
    patterns = load_ignore_patterns(vault_root)
    docs = []  # list of (path, tokens, raw_body_for_snippet)
    for p in vault_root.rglob("*.md"):
        r = rel(p, vault_root)
        if is_ignored(r, patterns):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        fm = parse_frontmatter(text)
        body = text[len(fm) + 8:] if fm else text  # skip past "---\n...\n---\n"
        title = p.stem
        combined = ((title + " ") * TITLE_BOOST) + " " + fm + " " + body
        docs.append((p, tokenize(combined), body))
    return docs


def bm25_search(docs, query: str, top_k: int):
    q_tokens = tokenize(query)
    if not q_tokens:
        return []

    N = len(docs)
    doc_lens = [len(toks) for _, toks, _ in docs]
    avgdl = sum(doc_lens) / N if N else 0

    df = {}
    for _, toks, _ in docs:
        for t in set(toks):
            df[t] = df.get(t, 0) + 1

    idf = {}
    for t in set(q_tokens):
        n_t = df.get(t, 0)
        idf[t] = math.log((N - n_t + 0.5) / (n_t + 0.5) + 1)

    scores = []
    for (path, toks, body), dlen in zip(docs, doc_lens):
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        score = 0.0
        for t in q_tokens:
            f = tf.get(t, 0)
            if f == 0:
                continue
            denom = f + K1 * (1 - B + B * dlen / avgdl)
            score += idf[t] * (f * (K1 + 1)) / denom
        if score > 0:
            scores.append((score, path, body))

    scores.sort(key=lambda x: x[0], reverse=True)
    return scores[:top_k]


def make_snippet(body: str, query: str, snippet_len: int) -> str:
    q_words = [w for w in WORD_RE.findall(query) if len(w) >= 2]
    lower_body = body.lower()
    pos = -1
    for w in q_words:
        idx = lower_body.find(w.lower())
        if idx != -1:
            pos = idx
            break
    if pos == -1:
        snippet = body.strip().replace("\n", " ")[:snippet_len]
    else:
        start = max(0, pos - snippet_len // 3)
        snippet = body[start:start + snippet_len].strip().replace("\n", " ")
    return snippet


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("vault", help="vault root path")
    ap.add_argument("query", help="search query")
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument("--snippet-len", type=int, default=120)
    args = ap.parse_args()

    vault_root = Path(args.vault).resolve()
    docs = build_corpus(vault_root)
    results = bm25_search(docs, args.query, args.top_k)

    if not results:
        print(f"'{args.query}'에 대한 결과 없음 (검색된 노트: {len(docs)}개)")
        return

    print(f"=== '{args.query}' 검색 결과 (상위 {len(results)}, 전체 {len(docs)}개 노트 중) ===")
    for score, path, body in results:
        r = rel(path, vault_root)
        snippet = make_snippet(body, args.query, args.snippet_len)
        print(f"\n[{score:.2f}] {r}")
        print(f"  ...{snippet}...")


if __name__ == "__main__":
    main()
