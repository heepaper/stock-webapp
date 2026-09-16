---
name: bm25-search
description: Run BM25 keyword search over the <YOUR_VAULT_NAME> Obsidian vault. Use when asked to find/search notes about a topic, keyword, or concept without an exact filename, or when Graphify's structural graph can't answer a "which notes mention X" question. Not semantic/vector search - exact and near-exact keyword matching only.
---

# bm25-search

`<YOUR_VAULT_NAME>` 전용 경량 키워드 검색. 외부 의존성 없음(Python 3
표준 라이브러리만 사용, pip install 불필요). RAG(벡터 임베딩) 도입 전
단계로 CLAUDE.md 장기 과제에 명시된 방식 — Graphify(구조적 그래프)가
못 답하는 "이 키워드 언급된 노트 다 찾아줘" 류 질문을 임베딩 비용 없이
메꾼다.

## 실행

```bash
python3 bm25_search.py <vault_path> "<검색어>" [--top-k N] [--snippet-len N]
```

- `<vault_path>`: `<YOUR_VAULT_NAME>` 리포 루트
- `--top-k`: 반환할 결과 수 (기본 10)
- `--snippet-len`: 결과당 미리보기 글자 수 (기본 120)

매 실행마다 전체 노트를 다시 스캔해서 즉석으로 인덱싱한다 — 노트 수가
(2026-09 기준 176개) 적어서 별도 인덱스 캐시 파일 없이도 1초 이내로
끝난다. 캐시가 없으므로 노트가 새로 생기거나 수정돼도 항상 최신 상태로
검색된다.

## 무엇을 하는가

Okapi BM25(k1=1.5, b=0.75) 랭킹 알고리즘을 직접 구현. 한국어는 공백
기준 단어 분리가 잘 안 맞아서, 토큰화를 이렇게 나눈다:

- 한글이 섞인 구간 → 문자 bigram(2글자씩 겹쳐 자르기, 예: "국민연금"
  → "국민"·"민연"·"연금")으로 분해 — 형태소 분석기 없이도 부분 일치를 잡음
- 영문/숫자 구간(티커, 수치, 영어 용어) → 소문자 변환 후 단어 그대로 유지
- 노트 제목(파일명)은 본문보다 가중치를 높게 줌(3배 반복) — 제목에
  정확히 매치되는 노트가 더 상위에 오도록

`.graphifyignore`를 그대로 읽어서 같은 경로(`경제/02-자산관리` 등
민감정보)를 검색 대상에서도 제외한다 — Graphify와 검색 대상 범위를
일치시켜 별도 설정을 안 만듦.

## 결과 해석 시 유의할 것

1. **키워드 매칭이지 의미 검색이 아니다** — "메모리 반도체"로 검색해도
   "SK하이닉스"만 쓴 노트는 안 잡힐 수 있다(동의어 확장 없음). 여러
   관련어로 나눠 검색하거나, 결과가 부족하면 사용자에게 다른 검색어를
   제안할 것.
2. **점수(BM25 raw score)는 노트 간 상대 비교용일 뿐, 절대적 "관련도
   %"가 아니다** — 검색어 길이·희귀도에 따라 점수 스케일이 달라진다.
3. **`_Summary_*.md` 허브 문서가 자주 상위에 뜬다** — 여러 인사이트를
   종합해서 키워드 밀도가 높기 때문. 사용자가 원문 노트를 찾는 맥락이면
   결과에서 걸러서 안내할 것.
4. **자동 자막 기반 노트의 고유명사 오인식** 문제는 이 검색으로도 못
   잡아낸다 — 검색어 자체가 틀린 표기라면 결과가 안 나올 수 있다는 점을
   염두에 둘 것.
5. **vault 파일을 전혀 수정하지 않는 읽기 전용 도구** — wiki-lint와
   마찬가지로 결과를 vault에 노트로 저장하지 않고 채팅으로만 보여준다.
