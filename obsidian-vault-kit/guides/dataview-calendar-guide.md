# Dataview 캘린더 가이드

`dataviewjs`로 노트 안 표(table) 데이터를 월별 캘린더 그리드로 그려주는 패턴 모음입니다. 별도 캘린더 플러그인 없이 **Dataview 하나만으로** 구현하며, 아래 세 단계로 구성됩니다.

- **패턴 A**: 노트 하나 안에서 여러 표(분류별)를 하나의 캘린더로 합치기
- **패턴 B**: 여러 노트를 태그로 모아 총괄 캘린더로 합치기 (패턴 A 위에 얹는 확장)
- **확장**: 구글/네이버/아웃룩 같은 외부 캘린더(ICS)를 같은 그리드에 겹쳐 보기

## 사전 준비 — Dataview 플러그인

1. 설정 → Community plugins → Browse → "Dataview" 검색·설치·활성화
2. 마켓플레이스 접근이 막힌 환경(사내망 등)이라면 [blacksmithgu/obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview) 소스를 받아 `npm install && npm run build` 후 `main.js`/`manifest.json`/`styles.css`를 `.obsidian/plugins/dataview/`에 직접 넣는 방식으로도 설치 가능

## 패턴 A — 노트 하나 안에서 표 여러 개를 캘린더 하나로 합치기

### 구조
- 노트 하나 안에 분류별 표(예: 휴가 / 기타 전일근태 / 중요일정)를 `##` 제목으로 구분해서 여러 개 둠
- 그 아래 `dataviewjs` 코드블록 하나가 표들을 전부 읽어 하나의 월별 달력으로 합쳐서 그림 — 문서/파일을 늘리지 않고 표만 늘어남
- 표 형식은 공통: `날짜 | 내용 | 메모`(분류는 표 자체가 곧 분류라 별도 컬럼 없음)
- 날짜 칸은 `2026-09-05~09-07`처럼 범위 표기 가능(종료일은 `월-일`/`일`만 적어도 시작일 기준으로 보완됨) — 여러 날짜에 걸치는 일정에 사용

### 사용법
1. 새 노트를 만들고 아래 템플릿 전체를 그대로 붙여넣기
2. 각 표에 실제 행 추가 — 캘린더가 자동으로 반영
3. 분류를 더 늘리고 싶으면: `## 새분류` 제목 + 표 하나 추가하고, 코드 안 `CATEGORY_COLORS`에 `"새분류": "색상"` 한 줄만 추가

### 분류·색상 (예시 — 자유롭게 바꿔서 사용)
| 분류 | 색상 | 비고 |
| ---- | ---- | ---- |
| 휴가 | 파랑 | |
| 기타 전일근태 | 주황 | 교육 등 |
| 중요일정 | 빨강 | 강조하고 싶은 일정 |

### 템플릿 (아래 전체를 새 노트에 복사)

````markdown
## 휴가

| 날짜 | 내용 | 메모 |
| ---- | ---- | ---- |
|      |      |      |

## 기타 전일근태

| 날짜 | 내용 | 메모 |
| ---- | ---- | ---- |
|      |      |      |

## 중요일정

| 날짜 | 내용 | 메모 |
| ---- | ---- | ---- |
|      |      |      |

## 캘린더 보기

```dataviewjs
// 위 3개 표(휴가/기타 전일근태/중요일정)를 같은 노트 안에서 각각 읽어
// 하나의 월별 달력으로 합쳐서 그림. 표를 더 추가하려면 아래
// CATEGORY_COLORS에 "제목 그대로" 키를 추가하면 자동으로 인식됨.
const CATEGORY_COLORS = {
    "휴가": "var(--color-blue)",
    "기타 전일근태": "var(--color-orange)",
    "중요일정": "var(--color-red)",
};
const DEFAULT_COLOR = "var(--interactive-accent)";
const MAX_RANGE_DAYS = 31; // 오타로 범위가 통째로 잘못 잡혀도 무한루프/폭주 방지

const text = await dv.io.load(dv.current().file.path);
const lines = text.split("\n");

// 헤딩(##) 별로 그 아래 표를 해당 분류로 귀속시켜 수집
let currentCategory = null;
const rowsByCategory = {};
for (const raw of lines) {
    const line = raw.trim();
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
        const heading = headingMatch[1].trim();
        currentCategory = CATEGORY_COLORS[heading] ? heading : null;
        continue;
    }
    if (!currentCategory || !line.startsWith("|")) continue;
    if (/^[|:\-\s]+$/.test(line)) continue; // 구분선 skip

    const cells = line.split("|");
    cells.shift();
    cells.pop();
    const row = cells.map(c => c.trim());
    if (row[0] && row[0] !== "날짜") { // 헤더행 skip
        (rowsByCategory[currentCategory] ??= []).push(row);
    }
}

// 행(날짜 범위 포함) -> 날짜별 entry로 펼치기
const entries = [];
for (const [category, rows] of Object.entries(rowsByCategory)) {
    for (const r of rows) {
        if (!r[0]) continue;
        const [startStr, endStrRaw] = r[0].split("~").map(s => s.trim());
        const start = dv.date(startStr);
        if (!start || !start.isValid) continue;

        let end = start;
        if (endStrRaw) {
            // 종료일은 "2026-09-07"(전체) / "09-07"(월-일만) / "07"(일만) 다 허용
            let endStr = endStrRaw;
            if (/^\d{1,2}$/.test(endStr)) {
                endStr = `${start.year}-${String(start.month).padStart(2, "0")}-${endStr.padStart(2, "0")}`;
            } else if (/^\d{1,2}-\d{1,2}$/.test(endStr)) {
                endStr = `${start.year}-${endStr}`;
            }
            const parsedEnd = dv.date(endStr);
            if (parsedEnd && parsedEnd.isValid) end = parsedEnd;
        }

        let d = start;
        let guard = 0;
        while (d <= end && guard < MAX_RANGE_DAYS) {
            entries.push({ date: d, category, place: r[1] || category, note: r[2] || "" });
            d = d.plus({ days: 1 });
            guard++;
        }
    }
}

if (entries.length === 0) {
    dv.paragraph("_아직 기록된 날짜가 없습니다. 위 표들에 행을 추가하면 여기 캘린더에 자동으로 나타납니다._");
} else {
    const byMonth = {};
    for (const e of entries) {
        const key = e.date.toFormat("yyyy-LL");
        (byMonth[key] ??= []).push(e);
    }
    const monthKeys = Object.keys(byMonth).sort().reverse();
    const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];

    const legend = dv.el("div", "", { cls: "cal-legend" });
    legend.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:0.8em;";
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
        const item = document.createElement("span");
        item.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
        const dot = document.createElement("span");
        dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${color};display:inline-block;`;
        item.appendChild(dot);
        item.appendChild(document.createTextNode(cat));
        legend.appendChild(item);
    }

    for (const monthKey of monthKeys) {
        const monthEntries = byMonth[monthKey];
        const first = monthEntries[0].date.startOf("month");

        const wrap = dv.el("div", "", { cls: "cal-month" });
        wrap.style.marginBottom = "1.5em";
        const title = dv.el("div", monthKey, { container: wrap });
        title.style.cssText = "font-weight:600;margin-bottom:4px;";

        const table = document.createElement("table");
        table.style.cssText = "border-collapse:collapse;width:100%;table-layout:fixed;";
        const thead = table.createTHead();
        const headRow = thead.insertRow();
        weekdayNames.forEach(d => {
            const th = document.createElement("th");
            th.textContent = d;
            th.style.cssText = "border:1px solid var(--background-modifier-border);padding:2px;font-size:0.85em;opacity:0.7;";
            headRow.appendChild(th);
        });

        const tbody = table.createTBody();
        let row = tbody.insertRow();
        const startWeekday = first.weekday % 7; // Luxon: 월=1..일=7 -> 일=0으로 변환
        for (let i = 0; i < startWeekday; i++) row.insertCell();

        for (let day = 1; day <= first.daysInMonth; day++) {
            if (row.cells.length === 7) row = tbody.insertRow();
            const cell = row.insertCell();
            cell.style.cssText = "border:1px solid var(--background-modifier-border);vertical-align:top;padding:2px;height:3.2em;font-size:0.8em;";
            const cellDate = first.set({ day });

            const dayNum = document.createElement("div");
            dayNum.textContent = String(day);
            const weekdayIdx = cellDate.weekday % 7; // 0=일요일 ... 6=토요일
            const dayNumColor = weekdayIdx === 0 ? "var(--color-red)" : weekdayIdx === 6 ? "var(--color-blue)" : "inherit";
            dayNum.style.cssText = `opacity:0.6;color:${dayNumColor};`;
            cell.appendChild(dayNum);

            for (const e of monthEntries.filter(x => x.date.hasSame(cellDate, "day"))) {
                const tag = document.createElement("div");
                tag.textContent = e.place;
                tag.title = e.note || e.category;
                const color = CATEGORY_COLORS[e.category] || DEFAULT_COLOR;
                tag.style.cssText = `background:${color};color:#fff;border-radius:3px;padding:1px 3px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                cell.appendChild(tag);
            }
        }
        while (row.cells.length < 7) row.insertCell();
        wrap.appendChild(table);
    }
}
```
````

## 패턴 B — 여러 노트를 모아 총괄 캘린더로 합치기 (확장)

패턴 A는 페이지 1개 안에서 표 여러 개를 합치는 방식이었다면, 이건 반대로 **페이지 자체가 여러 개**(예: 팀별/프로젝트별로 페이지를 따로 두고, 각 페이지는 표가 1개일 수도 여러 개일 수도 있음)일 때, 총괄 페이지 하나가 그 페이지들을 순회하며 표를 전부 읽어 캘린더 하나로 합치는 방법입니다. 패턴 A 위에 얹는 애드온이라 기존 페이지 구조·코드는 그대로 두면 됩니다.

### 조건
- 취합 대상 페이지는 frontmatter `태그`에 공통 태그(예: `일정표`) 하나를 추가해서 표시해둬야 함 — 총괄 페이지가 이 태그로 대상을 찾음
- 표 형식은 패턴 A의 두 형식을 자동으로 다 인식함: `날짜｜활동/장소｜분류｜메모`(분류가 컬럼으로 있는 형식) 또는 `## 제목` 아래 `날짜｜내용｜메모`(분류 = 제목인 형식) — 페이지마다 달라도 됨

### 총괄 페이지 코드

```dataviewjs
// 패턴 B: SOURCE_TAG를 가진 모든 페이지의 표를 읽어 하나의 캘린더로 합침.
// 대상 페이지가 되려면 frontmatter 태그에 SOURCE_TAG(아래는 "일정표")를 추가하면 됨.
const SOURCE_TAG = "#일정표";
const MAX_RANGE_DAYS = 31;
const CATEGORY_COLORS = {
    "휴가": "var(--color-blue)",
    "기타 전일근태": "var(--color-orange)",
    "중요일정": "var(--color-red)",
    // 다른 페이지가 새 분류/제목을 쓰면 여기 추가 — 색상은 총괄 페이지가 한 곳에서만 관리
};
const DEFAULT_COLOR = "var(--interactive-accent)";

// 페이지 텍스트 하나에서 entry 목록 뽑기 - 분류컬럼(패턴A 4열)/제목기반(패턴A 3열) 둘 다 자동 인식
function extractEntriesFromText(text) {
    const lines = text.split("\n");
    let heading = null;
    let header = null;
    const out = [];

    for (const raw of lines) {
        const line = raw.trim();
        const h = line.match(/^#{1,6}\s+(.+)$/);
        if (h) { heading = h[1].trim(); header = null; continue; }
        if (!line.startsWith("|")) continue;
        if (/^[|:\-\s]+$/.test(line)) continue; // 구분선

        const cells = line.split("|");
        cells.shift();
        cells.pop();
        const row = cells.map(c => c.trim());

        if (row[0] === "날짜") { header = row; continue; } // 헤더행 - 이 표의 컬럼 구조 기억
        if (!header || !row[0]) continue;

        const catIdx = header.indexOf("분류");
        const placeIdx = header.indexOf("활동/장소") >= 0 ? header.indexOf("활동/장소") : header.indexOf("내용");
        const noteIdx = header.indexOf("메모");

        const category = catIdx >= 0 ? row[catIdx] : (heading || "기타");
        const place = placeIdx >= 0 ? row[placeIdx] : (row[1] || category);
        const note = noteIdx >= 0 ? row[noteIdx] : "";

        const [startStr, endStrRaw] = row[0].split("~").map(s => s.trim());
        const start = dv.date(startStr);
        if (!start || !start.isValid) continue;

        let end = start;
        if (endStrRaw) {
            let endStr = endStrRaw;
            if (/^\d{1,2}$/.test(endStr)) {
                endStr = `${start.year}-${String(start.month).padStart(2, "0")}-${endStr.padStart(2, "0")}`;
            } else if (/^\d{1,2}-\d{1,2}$/.test(endStr)) {
                endStr = `${start.year}-${endStr}`;
            }
            const parsedEnd = dv.date(endStr);
            if (parsedEnd && parsedEnd.isValid) end = parsedEnd;
        }

        let d = start;
        let guard = 0;
        while (d <= end && guard < MAX_RANGE_DAYS) {
            out.push({ date: d, category, place, note });
            d = d.plus({ days: 1 });
            guard++;
        }
    }
    return out;
}

// SOURCE_TAG 붙은 모든 페이지를 순회하며 entry 취합
const sourcePages = dv.pages(SOURCE_TAG);
let entries = [];
for (const page of sourcePages) {
    const text = await dv.io.load(page.file.path);
    const pageEntries = extractEntriesFromText(text).map(e => ({ ...e, sourceTitle: page.file.name }));
    entries = entries.concat(pageEntries);
}

// 이하 렌더링은 패턴 A와 동일 (달력 그리드 + 범례), 태그 툴팁에 출처 페이지명만 추가
if (entries.length === 0) {
    dv.paragraph(`_"${SOURCE_TAG}" 태그가 붙은 페이지에서 아직 읽을 표가 없습니다._`);
} else {
    const byMonth = {};
    for (const e of entries) {
        const key = e.date.toFormat("yyyy-LL");
        (byMonth[key] ??= []).push(e);
    }
    const monthKeys = Object.keys(byMonth).sort().reverse();
    const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];

    const legend = dv.el("div", "", { cls: "cal-legend" });
    legend.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:0.8em;";
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
        const item = document.createElement("span");
        item.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
        const dot = document.createElement("span");
        dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${color};display:inline-block;`;
        item.appendChild(dot);
        item.appendChild(document.createTextNode(cat));
        legend.appendChild(item);
    }

    for (const monthKey of monthKeys) {
        const monthEntries = byMonth[monthKey];
        const first = monthEntries[0].date.startOf("month");

        const wrap = dv.el("div", "", { cls: "cal-month" });
        wrap.style.marginBottom = "1.5em";
        const title = dv.el("div", monthKey, { container: wrap });
        title.style.cssText = "font-weight:600;margin-bottom:4px;";

        const table = document.createElement("table");
        table.style.cssText = "border-collapse:collapse;width:100%;table-layout:fixed;";
        const thead = table.createTHead();
        const headRow = thead.insertRow();
        weekdayNames.forEach(d => {
            const th = document.createElement("th");
            th.textContent = d;
            th.style.cssText = "border:1px solid var(--background-modifier-border);padding:2px;font-size:0.85em;opacity:0.7;";
            headRow.appendChild(th);
        });

        const tbody = table.createTBody();
        let row = tbody.insertRow();
        const startWeekday = first.weekday % 7;
        for (let i = 0; i < startWeekday; i++) row.insertCell();

        for (let day = 1; day <= first.daysInMonth; day++) {
            if (row.cells.length === 7) row = tbody.insertRow();
            const cell = row.insertCell();
            cell.style.cssText = "border:1px solid var(--background-modifier-border);vertical-align:top;padding:2px;height:3.2em;font-size:0.8em;";
            const cellDate = first.set({ day });

            const dayNum = document.createElement("div");
            dayNum.textContent = String(day);
            const weekdayIdx = cellDate.weekday % 7; // 0=일요일 ... 6=토요일
            const dayNumColor = weekdayIdx === 0 ? "var(--color-red)" : weekdayIdx === 6 ? "var(--color-blue)" : "inherit";
            dayNum.style.cssText = `opacity:0.6;color:${dayNumColor};`;
            cell.appendChild(dayNum);

            for (const e of monthEntries.filter(x => x.date.hasSame(cellDate, "day"))) {
                const tag = document.createElement("div");
                tag.textContent = e.place;
                tag.title = `${e.note || e.category} (${e.sourceTitle})`;
                const color = CATEGORY_COLORS[e.category] || DEFAULT_COLOR;
                tag.style.cssText = `background:${color};color:#fff;border-radius:3px;padding:1px 3px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                cell.appendChild(tag);
            }
        }
        while (row.cells.length < 7) row.insertCell();
        wrap.appendChild(table);
    }
}
```

### 참고
- 소스 페이지가 많아지면 `dv.pages(SOURCE_TAG)`가 매번 전체를 다시 읽어서 페이지 수·표 크기에 따라 느려질 수 있음 — 페이지 수가 많아지면(수십 개 이상) 그때 성능 재판단
- 색상 매핑(`CATEGORY_COLORS`)은 총괄 페이지 쪽에서만 관리 — 소스 페이지에 로컬 코드블록(패턴 A처럼 그 페이지 자체 캘린더도 있는 경우)이 있으면 색상이 다르게 보일 수 있으니, 이름을 맞추거나 색을 통일해둘 것
- 실사용 전 실제 페이지 2~3개로 태그·표 인식이 되는지 먼저 확인 권장

## 확장 — 외부 캘린더(ICS) 겹쳐보기

패턴 A의 표(들) 위에, 구글/네이버/아웃룩 같은 외부 일정을 같은 그리드에 겹쳐서 보이게 하는 확장입니다. `entries` 배열 하나에 표 데이터 + ICS 일정을 같이 담아서, 렌더링(월별 그리드) 로직은 그대로 재사용합니다.

### 준비 — ① 원격 구독 또는 ② 로컬 파일
**① 원격 구독 주소 (`url`, 매번 fetch — 자주 바뀌는 캘린더용)**
- **구글 캘린더**: 캘린더 목록 → 대상 캘린더 옆 점 3개 → 설정 및 공유 → "캘린더 통합" → **비공개 주소(iCal 형식)** 복사
- **네이버 캘린더**: 설정 → 캘린더 관리 → 대상 캘린더 → **iCal 구독 주소** 복사
- 사내 그룹웨어/아웃룩 캘린더도 대부분 "ICS로 내보내기/구독 링크" 메뉴가 있음 — 사내 IT 정책상 외부 접근이 막혀있으면 이 방식 자체가 안 될 수 있으니 먼저 확인
- "읽기 전용 + 하루 1회 정도 갱신" — 실시간 반영 아님

**② 로컬 `.ics` 파일 (`path`, `dv.io.load`로 읽기 — 공휴일처럼 거의 안 바뀌는 캘린더용)**
- 대한민국 공휴일 `.ics`는 구글 캘린더의 "대한민국의 휴일" 공개 캘린더를 구독한 뒤 "캘린더 내보내기"로 `.ics` 파일을 받거나, `ko.south-korea#holiday@group.v.calendar.google.com` 캘린더의 공개 iCal 주소에서 파일을 내려받아 저장
- 받은 파일을 vault 안(예: `_attachments/공휴일.ics`)에 넣고, `ICS_SOURCES`에 `path`로 경로만 적으면 됨 — fetch 없이 로컬에서 즉시 읽어서 사내망 접근 제약과 무관하게 항상 동작
- 소스 항목에 `isHoliday: true`를 추가하면(아래 코드에 기본 포함), 그 소스에서 나온 날짜는 **날짜 칸 숫자가 일요일처럼 빨간색으로 표기됨** — 평일(화요일 등)에 낀 공휴일도 자동으로 빨간색 처리
- 연도가 바뀌면 새 `.ics`로 교체해줘야 함(자동 갱신 아님) — 매년 1회 정도의 수동 갱신

### 확장 코드 (위 "캘린더 보기" 코드블록을 통째로 이걸로 교체)

```dataviewjs
const CATEGORY_COLORS = {
    "휴가": "var(--color-blue)",
    "기타 전일근태": "var(--color-orange)",
    "중요일정": "var(--color-red)",
    "외부캘린더": "var(--color-cyan)", // ICS로 가져온 일정
};
const DEFAULT_COLOR = "var(--interactive-accent)";
const MAX_RANGE_DAYS = 31;

// 겹쳐볼 외부 캘린더 목록 - 필요한 만큼 추가
// url: 원격 구독 주소(매번 fetch) / path: vault 안에 저장해둔 로컬 .ics 파일 경로(dv.io.load) - 공휴일처럼 자주 안 바뀌는 캘린더는 로컬 파일로 충분
// isHoliday: true로 표시한 소스는 날짜 칸 숫자도 일요일처럼 빨간색으로 표기됨
const ICS_SOURCES = [
    // { name: "회사 구글", url: "https://calendar.google.com/calendar/ical/xxx/private-yyy/basic.ics" },
    // { name: "회사 아웃룩", url: "https://outlook.office365.com/owa/calendar/xxx/calendar.ics" },
    // { name: "공휴일", path: "_attachments/공휴일.ics", isHoliday: true },
];

// --- 1) 이 노트의 표 3개(휴가/기타 전일근태/중요일정) 읽기 (기존 로직 그대로) ---
const text = await dv.io.load(dv.current().file.path);
const lines = text.split("\n");

let currentCategory = null;
const rowsByCategory = {};
for (const raw of lines) {
    const line = raw.trim();
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
        const heading = headingMatch[1].trim();
        currentCategory = CATEGORY_COLORS[heading] ? heading : null;
        continue;
    }
    if (!currentCategory || !line.startsWith("|")) continue;
    if (/^[|:\-\s]+$/.test(line)) continue;

    const cells = line.split("|");
    cells.shift();
    cells.pop();
    const row = cells.map(c => c.trim());
    if (row[0] && row[0] !== "날짜") {
        (rowsByCategory[currentCategory] ??= []).push(row);
    }
}

const entries = [];
for (const [category, rows] of Object.entries(rowsByCategory)) {
    for (const r of rows) {
        if (!r[0]) continue;
        const [startStr, endStrRaw] = r[0].split("~").map(s => s.trim());
        const start = dv.date(startStr);
        if (!start || !start.isValid) continue;

        let end = start;
        if (endStrRaw) {
            let endStr = endStrRaw;
            if (/^\d{1,2}$/.test(endStr)) {
                endStr = `${start.year}-${String(start.month).padStart(2, "0")}-${endStr.padStart(2, "0")}`;
            } else if (/^\d{1,2}-\d{1,2}$/.test(endStr)) {
                endStr = `${start.year}-${endStr}`;
            }
            const parsedEnd = dv.date(endStr);
            if (parsedEnd && parsedEnd.isValid) end = parsedEnd;
        }

        let d = start;
        let guard = 0;
        while (d <= end && guard < MAX_RANGE_DAYS) {
            entries.push({ date: d, category, place: r[1] || category, note: r[2] || "" });
            d = d.plus({ days: 1 });
            guard++;
        }
    }
}

// --- 2) 외부 ICS 가져와서 같은 entries에 합치기 ---
function unfoldICS(raw) {
    return raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""); // RFC5545 줄 접기 해제
}

function parseICS(raw) {
    const text = unfoldICS(raw);
    const blocks = text.split("BEGIN:VEVENT").slice(1);
    const events = [];
    for (const block of blocks) {
        const body = block.split("END:VEVENT")[0];
        const summaryMatch = body.match(/\nSUMMARY:(.*)/);
        const dtStartMatch = body.match(/\nDTSTART[^:]*:(\d{8})/);
        const dtEndMatch = body.match(/\nDTEND[^:]*:(\d{8})/);
        if (!summaryMatch || !dtStartMatch) continue;

        const summary = summaryMatch[1].replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
        const s = dtStartMatch[1];
        const start = dv.date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
        if (!start || !start.isValid) continue;

        let end = start;
        if (dtEndMatch) {
            const e = dtEndMatch[1];
            let endDate = dv.date(`${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6, 8)}`);
            const isAllDay = /\nDTEND;VALUE=DATE:/.test(body);
            if (isAllDay) endDate = endDate.minus({ days: 1 }); // 종일 이벤트는 DTEND가 배타적 종료일
            if (endDate && endDate.isValid && endDate >= start) end = endDate;
        }
        events.push({ summary, start, end });
    }
    return events;
}

const holidaySet = new Set(); // isHoliday:true인 소스에서 나온 날짜(yyyy-LL-dd) - 날짜 칸 숫자를 빨간색으로 표기하는 데 씀
for (const src of ICS_SOURCES) {
    try {
        let icsText;
        if (src.path) {
            icsText = await dv.io.load(src.path); // vault 내 로컬 .ics 파일
        } else if (src.url) {
            const res = await fetch(src.url); // 원격 구독 주소
            icsText = await res.text();
        } else {
            continue;
        }
        for (const ev of parseICS(icsText)) {
            let d = ev.start;
            let guard = 0;
            while (d <= ev.end && guard < MAX_RANGE_DAYS) {
                entries.push({ date: d, category: "외부캘린더", place: ev.summary, note: src.name });
                if (src.isHoliday) holidaySet.add(d.toFormat("yyyy-LL-dd"));
                d = d.plus({ days: 1 });
                guard++;
            }
        }
    } catch (err) {
        console.error("ICS 불러오기 실패:", src.name, err);
    }
}

// --- 3) 렌더링 (기존과 동일 — entries에 표+ICS가 이미 다 합쳐져 있음) ---
if (entries.length === 0) {
    dv.paragraph("_아직 기록된 날짜가 없습니다. 위 표들에 행을 추가하거나 ICS_SOURCES를 채우면 여기 캘린더에 자동으로 나타납니다._");
} else {
    const byMonth = {};
    for (const e of entries) {
        const key = e.date.toFormat("yyyy-LL");
        (byMonth[key] ??= []).push(e);
    }
    const monthKeys = Object.keys(byMonth).sort().reverse();
    const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];

    const legend = dv.el("div", "", { cls: "cal-legend" });
    legend.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;font-size:0.8em;";
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
        const item = document.createElement("span");
        item.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
        const dot = document.createElement("span");
        dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${color};display:inline-block;`;
        item.appendChild(dot);
        item.appendChild(document.createTextNode(cat));
        legend.appendChild(item);
    }

    for (const monthKey of monthKeys) {
        const monthEntries = byMonth[monthKey];
        const first = monthEntries[0].date.startOf("month");

        const wrap = dv.el("div", "", { cls: "cal-month" });
        wrap.style.marginBottom = "1.5em";
        const title = dv.el("div", monthKey, { container: wrap });
        title.style.cssText = "font-weight:600;margin-bottom:4px;";

        const table = document.createElement("table");
        table.style.cssText = "border-collapse:collapse;width:100%;table-layout:fixed;";
        const thead = table.createTHead();
        const headRow = thead.insertRow();
        weekdayNames.forEach(d => {
            const th = document.createElement("th");
            th.textContent = d;
            th.style.cssText = "border:1px solid var(--background-modifier-border);padding:2px;font-size:0.85em;opacity:0.7;";
            headRow.appendChild(th);
        });

        const tbody = table.createTBody();
        let row = tbody.insertRow();
        const startWeekday = first.weekday % 7;
        for (let i = 0; i < startWeekday; i++) row.insertCell();

        for (let day = 1; day <= first.daysInMonth; day++) {
            if (row.cells.length === 7) row = tbody.insertRow();
            const cell = row.insertCell();
            cell.style.cssText = "border:1px solid var(--background-modifier-border);vertical-align:top;padding:2px;height:3.2em;font-size:0.8em;";
            const cellDate = first.set({ day });

            const dayNum = document.createElement("div");
            dayNum.textContent = String(day);
            const weekdayIdx = cellDate.weekday % 7; // 0=일요일 ... 6=토요일
            const isHoliday = holidaySet.has(cellDate.toFormat("yyyy-LL-dd"));
            const dayNumColor = (weekdayIdx === 0 || isHoliday) ? "var(--color-red)" : weekdayIdx === 6 ? "var(--color-blue)" : "inherit";
            dayNum.style.cssText = `opacity:0.6;color:${dayNumColor};`;
            cell.appendChild(dayNum);

            for (const e of monthEntries.filter(x => x.date.hasSame(cellDate, "day"))) {
                const tag = document.createElement("div");
                tag.textContent = e.place;
                tag.title = e.note || e.category;
                const color = CATEGORY_COLORS[e.category] || DEFAULT_COLOR;
                tag.style.cssText = `background:${color};color:#fff;border-radius:3px;padding:1px 3px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                cell.appendChild(tag);
            }
        }
        while (row.cells.length < 7) row.insertCell();
        wrap.appendChild(table);
    }
}
```

### 참고 / 제약
- `fetch()`가 데스크톱에서는 대체로 문제없이 되지만, **모바일 앱(iOS/Android)은 네트워크·CORS 제약으로 안 될 수 있음** — 데스크톱에서 먼저 확인. **로컬 파일(`path`)은 이 제약이 없음** — `dv.io.load`는 vault 안 파일을 읽는 거라 fetch/CORS/사내망 문제와 무관하게 항상 동작
- 사내망이 외부 도메인(구글/아웃룩 등) 접근을 막아두면 `fetch` 자체가 실패함 — 이 경우 원격 구독은 안 되고, 공휴일처럼 로컬 파일로 대체 가능한 것만 표시됨
- ICS는 서비스 쪽 캐시 주기(보통 몇 시간~하루)가 있어 방금 넣은 일정이 바로 안 보일 수 있음 (로컬 파일은 캐시가 아니라 "파일을 새로 안 바꿨으면 그대로"인 것뿐 — 파일을 교체하면 바로 반영)
- 종일(all-day) 이벤트와 시간 지정 이벤트를 둘 다 날짜 단위로만 취급함(시각 정보는 버림)
- 외부 일정은 참고용으로만 표시되고 이 노트에서 수정/삭제되지 않음(원본은 항상 구글/아웃룩 등 원본 서비스 쪽, 로컬 파일은 그 파일 자체)
- Obsidian이 기본적으로 `.ics` 확장자를 첨부파일로 인식하지 못할 수 있음 — vault에 넣었는데 안 보이면 설정 → 파일 및 링크에서 허용 확장자 확인 필요(안 되면 `.txt`로 저장 후 `path`만 정확히 맞춰도 `dv.io.load`는 내용을 읽을 수 있음)
