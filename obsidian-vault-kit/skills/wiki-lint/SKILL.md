---
name: wiki-lint
description: Run a deterministic, read-only health check on the <YOUR_VAULT_NAME> Obsidian vault. Use for lint, vault health check, 고아 노트, 깨진 링크, frontmatter 누락, Summary 문서 커버리지 확인 요청. Reports findings only; never edits or writes files.
---

# wiki-lint

`<YOUR_VAULT_NAME>` 전용 경량 vault 점검 스크립트. 외부 의존성 없음(Python 3
표준 라이브러리만 사용). claude-obsidian(AgriciDaniel) 프로젝트의 `wiki-lint`
아이디어에서 착안했지만, 그 프로젝트 전체(transaction/ledger 시스템 등)를
가져오지 않고 이 vault 구조에 맞춰 새로 작성한 독립 스크립트.

## 실행

```bash
python3 wiki_lint.py <vault_path> [--format text|markdown] [--strict]
```

- `<vault_path>`: `<YOUR_VAULT_NAME>` 리포 루트. 생략 시 현재 디렉터리.
- `--format markdown`: 마크다운 표로 출력 (채팅에 그대로 붙여넣기 좋음)
- `--strict`: findings가 하나라도 있으면 exit code 1 (자동화용, 평소엔 불필요)

## 무엇을 확인하는가

1. **깨진/모호한 위키링크** — `[[...]]`, `![[...]]` 전부 파싱해서 대상 노트가
   실제로 존재하는지 확인. Obsidian의 "최단 고유 경로" 링크 해석 방식(전체
   경로의 suffix 매칭)과 `../` 상대 경로 링크 둘 다 지원.
2. **고아 노트** — 어디서도 `[[...]]`로 참조되지 않은 노트. `_templates`,
   `00-Inbox`, `01-Clippings`, `_Keep_Original`, `graphify-out`은 성격상
   제외.
3. **frontmatter 필드 누락** — 공통 필수 필드(`분야`/`세부주제`/`태그`/`날짜`/
   `관련`) + 유튜브 노트는 `유형`/`출처`/`원본링크`/`원제목` 추가 확인. 배열
   필드(`세부주제`/`태그`/`관련`)는 빈 배열 `[]`을 정상으로 취급 — 빈 게
   아니라 키 자체가 없을 때만 잡음.
4. **채널 Summary 미언급 노트** — `_Summary_<채널명>.md`가 있는 폴더마다,
   그 폴더(하위 폴더 포함) 안의 다른 노트가 Summary 문서 안에 `[[...]]`로
   전혀 언급 안 됐는지 확인.

## 결과 해석 시 반드시 지킬 것

이 스크립트는 **결정론적 사실만 보고**한다 — 의미 분석이나 "이 노트가
중요한지"는 판단하지 않는다. 결과를 사용자에게 전달하기 전에:

1. **고아 노트가 곧 문제는 아님** — 신규 작성 직후라 아직 아무도 안
   링크했을 수도 있고, `CLAUDE.md`/`_index.md`류 최상위 문서는 원래
   구조상 고아로 나옴. 맥락 없이 "삭제해야 함"으로 해석하지 말 것.
2. **채널 Summary 미언급 노트는 스크립트가 `[[정확한 파일명]]` 형태만
   찾는다** — 이전에 겪었듯, Summary 본문에서 `(08-11)` 같은 날짜만
   언급하고 풀네임 위키링크를 안 쓰는 경우가 실제로 있었다. "미언급"으로
   잡힌 노트는 보고 전에 Summary 본문에서 해당 날짜 패턴(`MM-DD`)으로
   한 번 더 직접 검색해서 오탐을 걸러낼 것.
3. **frontmatter 누락 중 일부는 의도된 것일 수 있음** — 예: `_Summary_*.md`
   허브 문서는 `관련`/`원본링크`가 원래 없을 수 있고, 채널 폴더 안의
   "커뮤니티 게시물"처럼 영상 요약과 다른 성격의 글은 `유형`/`원제목`이
   애초에 안 맞을 수 있음. 무조건 다 채우라고 하지 말고 왜 비어있는지
   먼저 확인.
4. **절대 자동으로 고치지 않는다** — 이 스킬은 보고만 한다. 사용자가 특정
   finding을 고치기로 하면, 그건 완전히 별개의 편집 작업으로 취급하고
   평소 vault 편집 규칙(CLAUDE.md의 git 동기화·커밋 절차 등)을 그대로 따를 것.
5. **Graphify와는 다른 도구** — Graphify는 LLM 기반 의미 그래프, 이건 문자열
   기반 구조 점검. 결과가 안 겹쳐도 정상이고, 이 스크립트를 돌린다고
   Graphify 재실행이 필요해지지도 않음(vault 파일을 전혀 수정하지 않으므로).

## 출력물 저장 안 함

린트 결과를 vault 안에 파일로 저장하지 않는다 — 채팅/stdout으로만 보여줌.
사용자가 명시적으로 "이 결과를 노트로 저장해줘"라고 하면 그때만 별도 노트로
만들 것(그 경우도 일반 신규 노트 규칙 그대로 적용: frontmatter 템플릿 준수 등).
