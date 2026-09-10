# Obsidian Vault Kit

개인 Obsidian vault를 Claude Code와 함께 관리하면서 만든 **frontmatter 템플릿 + Claude Code 스킬 + 운영 정책** 모음입니다. 다른 컴퓨터(예: 회사 PC)에서 이 폴더만 내려받아 그대로 적용할 수 있도록, 특정 vault 이름·개인 폴더 구조·경로 등 개인 식별 정보는 모두 일반화·제거했습니다.

## 구성

```
obsidian-vault-kit/
├── templates/     # frontmatter 템플릿
├── skills/        # Claude Code 스킬 (Agent Skills)
└── policy/        # vault 운영 정책 문서
```

### `templates/`
- `frontmatter-template.md` — 모든 노트에 적용하는 공통 frontmatter 베이스(분야/세부주제/태그/날짜/관련)
- `youtube-frontmatter-template.md` — 유튜브 요약 노트 전용 확장 필드(유형/출처/원본링크/원제목) + "커뮤니티 게시물" 서브타입 규칙

값이 비어 있는 스켈레톤 상태이므로, 각자의 vault 구조·분류 체계에 맞게 채워서 쓰면 됩니다.

### `skills/`
Claude Code의 `.claude/skills/` 아래에 그대로 복사해서 쓰는 Agent Skills입니다. 사용하려는 vault를 `<YOUR_VAULT_NAME>`으로 표기해뒀으니, 실제 사용 전에 각 `SKILL.md`에서 이 부분을 자신의 vault 이름/경로로 바꿔주세요.

| 스킬 | 설명 | 외부 의존성 |
|---|---|---|
| `summarizing-youtube-to-obsidian` | 유튜브 URL → 한국어 요약 → Obsidian 노트(YAML frontmatter 포함) 생성 | `yt-dlp` |
| `summarizing-youtube-to-obsidian_v2` | 위와 동일하되 타임스탬프 기반 2단계 요약(사실 추출→종합), 긴 영상은 구간별로 분할 | `yt-dlp` |
| `wiki-lint` | 결정론적 읽기 전용 vault 점검 — 깨진/모호한 위키링크, 고아 노트, frontmatter 필드 누락, 채널 Summary 미반영 노트 탐지 | 없음(Python 표준 라이브러리만) |
| `bm25-search` | Okapi BM25 키워드 검색 — 한국어(문자 bigram)·영문/숫자 하이브리드 토큰화, 캐시 없이 즉석 검색 | 없음(Python 표준 라이브러리만) |
| `obsidian-markdown` | Obsidian 확장 마크다운 문법(위키링크·임베드·콜아웃·프로퍼티) 참조 | 없음 |
| `obsidian-bases` | `.base` 파일(뷰/필터/수식) 작성 참조 | 없음 |
| `defuddle` | 웹페이지 본문만 추출(광고·네비 제거), `WebFetch` 절약용 | npm CLI `defuddle` (없으면 `WebFetch`로 대체) |

`obsidian-markdown` / `obsidian-bases` / `defuddle` 세 개는 Obsidian CEO Steph Ango(kepano)가 공개한 [kepano/obsidian-skills](https://github.com/kepano/obsidian-skills)를 그대로 vendoring한 것입니다(MIT License, 각 폴더의 `LICENSE-upstream` 참고). 나머지(`wiki-lint`, `bm25-search`, 유튜브 요약 스킬 2종)는 자체 제작입니다.

### `policy/POLICY.md`
폴더/파일 명명 규칙, frontmatter 작성 원칙, 클리핑 이미지 저장 기준, 오디오 녹음 처리 기준, Obsidian 확장 마크다운 문법 적용 정책 등 — 특정 vault의 개인 폴더 구성과 무관하게 재사용 가능한 일반 규칙만 정리했습니다.

## 회사 PC 등 다른 환경에서 적용하는 법

1. 이 `obsidian-vault-kit/` 폴더 전체를 내려받는다(리포 clone 또는 폴더만 다운로드).
2. `templates/*.md`를 자신의 vault `_templates/` 폴더로 복사하고, 필요에 맞게 필드를 채운다.
3. `skills/*` 각각을 Claude Code 프로젝트의 `.claude/skills/` 아래로 복사(또는 심볼릭 링크/주니션)한다.
4. 복사한 `SKILL.md` 안의 `<YOUR_VAULT_NAME>`, `D:\<path-to-your-vault>\<YOUR_VAULT_NAME>` 부분을 실제 vault 이름·경로로 치환한다.
5. `policy/POLICY.md`를 참고해서 자신의 vault용 `CLAUDE.md`(또는 프로젝트 지침 파일)에 필요한 규칙을 옮겨 적는다 — 그대로 복사하기보다는 자신의 vault 구조에 맞게 대입해서 쓰는 것을 권장.

## 라이선스
- `skills/obsidian-markdown/`, `skills/obsidian-bases/`, `skills/defuddle/`: 각 폴더의 `LICENSE-upstream`(MIT, kepano) 참고
- 그 외(`wiki-lint`, `bm25-search`, 유튜브 요약 스킬 2종, `templates/`, `policy/`): 별도 라이선스 명시 없음, 자유롭게 참고·변형해서 사용
