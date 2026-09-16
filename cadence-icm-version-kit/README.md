# Cadence ICM Version Annotator

Cadence Virtuoso(Linux) + ICM(IC Manager) 환경에서, 스키매틱 하이어라키를 재귀적으로
순회하며 각 셀의 ICM current version을 조회하고, 이를 넷리스트에 주석으로 남기기 위한
SKILL 스크립트 초안입니다. 사내 라이브러리명·경로 등 식별 정보는 포함되어 있지 않고,
예시에 등장하는 `analogLib`/`digitalLib`/`customLib` 등은 모두 설명용 가상의 이름입니다.

## 구현 단계

### 1단계 — 하위 셀 버전 수집·저장
CDL/넷리스트로 나가는 한 circuit의 하위 셀 전체를 순회해, 각 셀의 ICM current version을
`libName/cellName : version` 형식으로 수집·저장합니다. 원본 넷리스트 파일은 건드리지 않고
별도의 버전 매니페스트(텍스트 파일)로 먼저 산출합니다.

### 2단계 — `.cdl` / `.net`에 버전 주석 삽입
1단계에서 만든 버전 테이블을 이용해 기존 넷리스트 파일의 서브서킷 정의 위에 버전 정보를
주석으로 삽입합니다. `.cdl`(SPICE 스타일 `.SUBCKT` / `*` 주석)과 `.net`(Spectre 스타일
`subckt` / `//` 주석)은 문법이 달라 각각 전용 함수로 제공하되, 핵심 로직은 공통 함수로 공유합니다.

## 1단계 흐름

1. `walkHierarchy` — 최상위 cellview부터 하위 인스턴스까지 재귀적으로 돌면서 방문
2. `getICMVersion` — 각 lib/cell/view의 ICM current revision을 `gdmhistory`로 조회
3. `gVersionTable` — `"libName/cellName"` → version 매핑 테이블에 저장
   (처음부터 lib를 키에 포함시켜, 서로 다른 라이브러리에 동명 셀이 있어도 덮어써지지 않게 함)
4. `saveVersionTable` — 수집된 테이블을 `libName/cellName : version` 형식의 텍스트 파일로 저장

## 1단계 스크립트

```skill
; ============================================================
; ICM Version Collector — 하위 셀 Lib/Cell:Version 수집·저장 (1단계)
; ============================================================

; --- 1) 전역 상태 테이블 ---
gVisited      = makeTable("visited" nil)         ; 중복 방문 방지
gVersionTable = makeTable("cellVersion" nil)      ; "libName/cellName" -> version string

; --- 2) ICM current version 조회 ---
procedure(getICMVersion(libName cellName viewName)
  let((gspec history)
    gspec = gdmCreateSpec(libName cellName viewName
              ddGetObj(libName cellName viewName "*")~>name "CDBA")
    history = errset(gdmhistory(gspec '(1)) t)  ; 1 = version 필드 (gdmhistory 문서 참조)
    if(history && car(history) then
      caar(history)   ; 가장 최근(current) 버전 문자열
      "N/A"            ; ICM 관리 대상이 아니거나 조회 실패
    )
  )
)

; --- 3) 하이어라키 재귀 워커 ---
procedure(walkHierarchy(libName cellName viewName)
  let((key cv version instLib versionKey)
    key = strcat(libName "/" cellName "/" viewName)
    unless(gVisited[key]
      gVisited[key] = t
      version = getICMVersion(libName cellName viewName)
      versionKey = strcat(libName "/" cellName)
      gVersionTable[versionKey] = version   ; key: "libName/cellName"

      cv = errset(dbOpenCellViewByType(libName cellName viewName "" "r"))
      when(cv
        cv = car(cv)
        foreach(inst cv~>instances
          instLib = inst~>libName
          when(instLib
            walkHierarchy(instLib inst~>cellName inst~>viewName)
          )
        )
        dbClose(cv)
      )
    )
  )
)

; --- 4) 수집한 버전 테이블을 "libName/cellName : version" 형식으로 저장 ---
procedure(saveVersionTable(outFile)
  let((outPort keyList)
    outPort = outfile(outFile)
    unless(outPort (error "출력 파일을 생성할 수 없습니다: %s" outFile))

    keyList = nil
    foreach(mapkey k gVersionTable
      keyList = cons(k keyList)
    )
    keyList = sort(keyList 'alphalessp)   ; libName/cellName 기준 정렬

    foreach(k keyList
      fprintf(outPort "%s : %s\n" k gVersionTable[k])
    )
    close(outPort)
    printf("완료: %s 에 %d개 셀의 버전 정보를 저장했습니다.\n" outFile length(keyList))
  )
)

; ============================================================
; 실행 예시 (1단계)
; ============================================================
gVisited      = makeTable("visited" nil)
gVersionTable = makeTable("cellVersion" nil)

topCv = geGetEditCellView()
walkHierarchy(topCv~>libName topCv~>cellName topCv~>viewName)

saveVersionTable("/path/to/cell_versions.txt")
```

## 1단계 결과 예시

```
analogLib/INV_X1 : 1.4
analogLib/NAND2_X2 : 2.0
digitalLib/DFF_X1 : N/A
```

## 1단계 실행 방법

1. 위 스크립트를 `.il` 파일로 저장 (예: `icmVersionCollect.il`)
2. Virtuoso CIW에서 로드:
   ```skill
   load("icmVersionCollect.il")
   ```
3. 넷리스팅하려는 최상위 스키매틱을 열어둔 상태에서 "실행 예시" 부분 실행
   (또는 `topCv`를 `dbOpenCellViewByType`으로 직접 지정해도 됨)
4. `saveVersionTable` 실행 결과로 `libName/cellName : version` 텍스트 파일 생성 확인

## 1단계 주의사항 / 한계

- **ICM 미관리 셀**: PDK 기본 셀, 파운드리 라이브러리 등 ICM 관리 대상이 아닌 셀은
  `gdmhistory` 호출이 실패할 수 있어 `errset`으로 감싸 스크립트가 중단되지 않게
  처리했습니다. 이런 셀은 `"N/A"`로 표시됩니다. 필요하면 `walkHierarchy` 안에서
  특정 라이브러리(사내 관리 라이브러리)만 대상으로 필터링하는 조건을 추가하세요.
- **대규모 설계 성능**: 인스턴스 수가 매우 많으면 `dbOpenCellViewByType`을 셀마다
  여는 방식이 느릴 수 있습니다. 속도가 문제되면 헤더만 가볍게 읽는 방식으로
  최적화하는 것을 검토하세요.
- **gdmhistory 필드 코드**: `'(1)`이 정확히 "version" 필드를 가리키는지는
  `?gdmhistory` 또는 `skdfref.pdf`(SKILL 함수 레퍼런스)에서 재확인하시는 것을
  권장합니다. DM 벤더별로 필드 순서가 다를 수 있습니다.

## 2단계 흐름

1. `loadVersionTable` — 1단계에서 저장한 `libName/cellName : version` 텍스트 파일을 읽어
   `gVersionTable`을 복원 (같은 CIW 세션에서 바로 이어 실행한다면 생략 가능)
2. `buildCellNameIndex` — `gVersionTable`(키: `libName/cellName`)로부터 `cellName → [libName/cellName...]`
   역인덱스를 생성. CDL/`.net`에는 cellName만 있고 라이브러리 정보가 없어서 필요
3. `lookupVersionByCellName` — cellName으로 역인덱스를 조회해 유일하게 매칭되면 버전을 반환,
   같은 cellName이 여러 라이브러리에 있으면 `'ambiguous`로 표시해 자동 오조회를 방지
4. `annotateNetlistWithICMVersion` — 서브서킷 정의 패턴(정규식)과 주석 문자를 인자로 받는 공통 삽입 로직
5. `annotateCDLWithICMVersion` / `annotateNetWithICMVersion` — 공통 로직을 각각 `.cdl`(`.SUBCKT`, `*`)과
   `.net`(`subckt`, `//`) 문법에 맞게 호출하는 전용 래퍼

## 2단계 스크립트

```skill
; ============================================================
; ICM Version Annotator — .cdl / .net 넷리스트에 버전 주석 삽입 (2단계)
; ============================================================

; --- 1) 저장된 버전 테이블 다시 읽기 (1단계와 별도 세션에서 실행할 때) ---
procedure(loadVersionTable(inFile)
  let((inPort line parts)
    gVersionTable = makeTable("cellVersion" nil)
    inPort = infile(inFile)
    unless(inPort (error "버전 테이블 파일을 열 수 없습니다: %s" inFile))
    while(gets(line inPort)
      parts = parseString(line " : ")
      when(length(parts) == 2
        gVersionTable[car(parts)] = cadr(parts)
      )
    )
    close(inPort)
  )
)

; --- 2) cellName -> [libName/cellName ...] 역인덱스 생성 ---
procedure(buildCellNameIndex()
  let((idx k parts cellOnly)
    idx = makeTable("cellNameIndex" nil)
    foreach(mapkey k gVersionTable
      parts = parseString(k "/")
      when(length(parts) == 2
        cellOnly = cadr(parts)
        idx[cellOnly] = cons(k idx[cellOnly])
      )
    )
    idx
  )
)

; --- 3) cellName으로 버전 조회 (유일 매칭 / 모호 / 없음 3가지 결과) ---
procedure(lookupVersionByCellName(cellIndex cellName)
  let((candidates)
    candidates = cellIndex[cellName]
    cond(
      (candidates == nil nil)                                  ; 매칭 없음
      (onep(length(candidates)) list(car(candidates) gVersionTable[car(candidates)]))  ; 유일 매칭
      (t list('ambiguous candidates))                          ; 여러 라이브러리에 동명 셀 존재
    )
  )
)

; --- 4) 모호한 후보를 사람이 읽을 수 있는 문자열로 변환 ---
procedure(buildCandidateString(keys)
  let((s)
    s = ""
    foreach(k keys
      s = strcat(s k "=" gVersionTable[k] " ")
    )
    s
  )
)

; --- 5) 공통 삽입 로직: 서브서킷 정규식 + 주석 문자를 받아 처리 ---
procedure(annotateNetlistWithICMVersion(inFile outFile cellIndex subcktRegex commentChar)
  let((inPort outPort line subcktName result)
    inPort  = infile(inFile)
    outPort = outfile(outFile)
    unless(inPort  (error "입력 파일을 열 수 없습니다: %s" inFile))
    unless(outPort (error "출력 파일을 생성할 수 없습니다: %s" outFile))

    while(gets(line inPort)
      when(rexMatchp(subcktRegex line)
        subcktName = rexSubstitute("\\1")
        result = lookupVersionByCellName(cellIndex subcktName)
        cond(
          (result == nil
            fprintf(outPort "%s ICM_VERSION: %s = N/A (버전 테이블에 없음)\n" commentChar subcktName)
          )
          (car(result) == 'ambiguous
            fprintf(outPort "%s ICM_VERSION: %s = AMBIGUOUS (%s)\n"
                    commentChar subcktName buildCandidateString(cadr(result)))
          )
          (t
            fprintf(outPort "%s ICM_VERSION: %s = %s (%s)\n"
                    commentChar subcktName cadr(result) car(result))
          )
        )
        fprintf(outPort "%s -----------------------------------------------\n" commentChar)
      )
      fprintf(outPort "%s\n" line)
    )
    close(inPort)
    close(outPort)
    printf("완료: %s 에 버전 주석이 삽입된 파일을 생성했습니다.\n" outFile)
  )
)

; --- 6a) .cdl 전용 래퍼 (SPICE 스타일: .SUBCKT, 주석 *) ---
procedure(annotateCDLWithICMVersion(inFile outFile cellIndex)
  annotateNetlistWithICMVersion(inFile outFile cellIndex "^\\.SUBCKT[ \t]+([A-Za-z0-9_]+)" "*")
)

; --- 6b) .net 전용 래퍼 (Spectre 스타일: subckt, 주석 //) ---
procedure(annotateNetWithICMVersion(inFile outFile cellIndex)
  annotateNetlistWithICMVersion(inFile outFile cellIndex "^[ \t]*subckt[ \t]+([A-Za-z0-9_]+)" "//")
)

; ============================================================
; 실행 예시 (2단계)
; ============================================================
; 1단계와 다른 세션이면 먼저 버전 테이블을 복원
loadVersionTable("/path/to/cell_versions.txt")

cellIndex = buildCellNameIndex()

annotateCDLWithICMVersion(
  "/path/to/original.cdl"
  "/path/to/original_versioned.cdl"
  cellIndex
)

annotateNetWithICMVersion(
  "/path/to/original.net"
  "/path/to/original_versioned.net"
  cellIndex
)
```

## 2단계 결과 예시

### `.cdl` (SPICE 스타일, `*` 주석)

```spice
* ICM_VERSION: INV_X1 = 1.4 (analogLib/INV_X1)
* -----------------------------------------------
.SUBCKT INV_X1 IN OUT VDD VSS
M0 OUT IN VDD VDD pfet w=0.5u l=0.1u
M1 OUT IN VSS VSS nfet w=0.5u l=0.1u
.ENDS
```

### `.net` (Spectre 스타일, `//` 주석)

```
// ICM_VERSION: INV_X1 = 1.4 (analogLib/INV_X1)
// -----------------------------------------------
subckt INV_X1 IN OUT VDD VSS
  ...
ends INV_X1
```

### 동명 셀이 여러 라이브러리에 있을 때 (AMBIGUOUS)

```spice
* ICM_VERSION: INV_X1 = AMBIGUOUS (analogLib/INV_X1=1.4 customLib/INV_X1=2.0 )
* -----------------------------------------------
.SUBCKT INV_X1 IN OUT VDD VSS
```
이 경우 어느 라이브러리 셀인지 자동으로 특정할 수 없으므로, 주석에 후보를 모두 나열만 하고
사람이 직접 확인해서 CDL/`.net`을 생성한 상위 회로의 라이브러리 우선순위(view 설정 등)를
기준으로 골라야 합니다.

## 2단계 실행 방법

1. 1단계 스크립트에 이어 위 스크립트를 같은 `.il` 파일에 추가하거나 별도 파일로 저장
   (예: `icmVersionAnnotate.il`)
2. Virtuoso CIW에서 로드 후 "실행 예시" 부분 실행 — CDL Out / netlist 생성으로 만든
   원본 `.cdl`, `.net` 파일 경로를 각각 지정
3. `.cdl`만 필요하면 `annotateCDLWithICMVersion`만, `.net`만 필요하면
   `annotateNetWithICMVersion`만 호출해도 됨 (둘 다 `cellIndex`를 공유)

## 2단계 보조: 버전 정보를 사이드카 파일로 저장

넷리스트 본문에 주석을 삽입하는 대신, `.cdl`/`.net`과 **같은 파일명·다른 확장자**로
ICM 버전 정보만 담은 파일을 별도로 저장하는 방식입니다. 원본 넷리스트는 전혀 건드리지 않고,
그 넷리스트에 실제로 등장하는 서브서킷만 추려서 버전을 기록합니다.
(예: `chip_top.cdl` → `chip_top.icm_ver`, `chip_top.net` → `chip_top.icm_ver`)

```skill
; ============================================================
; ICM Version Sidecar Writer — 넷리스트와 같은 이름/다른 확장자로 저장
; (앞선 2단계 스크립트의 buildCellNameIndex/lookupVersionByCellName/
;  buildCandidateString을 그대로 이어서 사용)
; ============================================================

; --- 7) 넷리스트에 실제 등장하는 서브서킷만 추려 "libName/cellName : version"으로 저장 ---
procedure(saveVersionSidecar(netlistFile cellIndex subcktRegex sidecarExt)
  let((inPort outPort outFile line subcktName result)
    outFile = rexReplace(netlistFile "\\.[A-Za-z0-9]+$" sidecarExt 1)
    inPort  = infile(netlistFile)
    outPort = outfile(outFile)
    unless(inPort  (error "입력 파일을 열 수 없습니다: %s" netlistFile))
    unless(outPort (error "출력 파일을 생성할 수 없습니다: %s" outFile))

    while(gets(line inPort)
      when(rexMatchp(subcktRegex line)
        subcktName = rexSubstitute("\\1")
        result = lookupVersionByCellName(cellIndex subcktName)
        cond(
          (result == nil
            fprintf(outPort "%s : N/A (버전 테이블에 없음)\n" subcktName)
          )
          (car(result) == 'ambiguous
            fprintf(outPort "%s : AMBIGUOUS (%s)\n" subcktName buildCandidateString(cadr(result)))
          )
          (t
            fprintf(outPort "%s : %s\n" car(result) cadr(result))
          )
        )
      )
    )
    close(inPort)
    close(outPort)
    printf("완료: %s 에 ICM 버전 정보를 저장했습니다.\n" outFile)
  )
)

; --- 8a) .cdl 전용 래퍼 ---
procedure(saveVersionSidecarForCDL(cdlFile cellIndex sidecarExt)
  saveVersionSidecar(cdlFile cellIndex "^\\.SUBCKT[ \t]+([A-Za-z0-9_]+)" sidecarExt)
)

; --- 8b) .net 전용 래퍼 ---
procedure(saveVersionSidecarForNet(netFile cellIndex sidecarExt)
  saveVersionSidecar(netFile cellIndex "^[ \t]*subckt[ \t]+([A-Za-z0-9_]+)" sidecarExt)
)

; ============================================================
; 실행 예시 (사이드카 저장)
; ============================================================
cellIndex = buildCellNameIndex()

saveVersionSidecarForCDL("/path/to/chip_top.cdl" cellIndex ".icm_ver")
saveVersionSidecarForNet("/path/to/chip_top.net" cellIndex ".icm_ver")
```

### 사이드카 결과 예시 (`chip_top.icm_ver`)

```
analogLib/INV_X1 : 1.4
analogLib/NAND2_X2 : 2.0
digitalLib/DFF_X1 : N/A
```

### 사이드카 저장 시 주의사항

- **같은 베이스네임이면 덮어씀**: `chip_top.cdl`과 `chip_top.net`처럼 베이스네임이 같으면
  둘 다 같은 사이드카 경로(`chip_top.icm_ver`)로 저장됩니다. 같은 top circuit에서 뽑은
  CDL/netlist라면 버전 내용이 동일해야 정상이지만, 서로 다른 hierarchy에서 뽑은 파일을
  같은 폴더에서 돌리면 의도치 않게 덮어쓸 수 있으니 주의하세요.
  꼭 분리하고 싶다면 `sidecarExt`를 `.cdl.icm_ver` / `.net.icm_ver`처럼 원본 확장자를
  포함한 값으로 넘기면 됩니다.
- **확장자 없는 경로**: `rexReplace`가 매칭할 `.`이 파일명에 없으면 확장자가 바뀌지 않고
  그대로 뒤에 `sidecarExt`가 붙습니다 (예: `chip_top` → `chip_topicm_ver`). 넷리스트 파일은
  보통 확장자가 있으므로 실사용에선 거의 발생하지 않지만, 확장자 없는 임시 파일에 쓸 경우
  주의하세요.
- 이 사이드카 파일은 1단계의 `saveVersionTable` 결과(전체 하이어라키 버전 목록)와 달리,
  **해당 넷리스트 파일에 실제로 등장하는 서브서킷만** 담습니다.

## 2단계 주의사항 / 한계

- **모호 매칭은 자동 해결 안 함**: 동일 `cellName`이 서로 다른 라이브러리에 존재하면
  `lookupVersionByCellName`이 `'ambiguous`를 반환하고, 주석에는 후보 전체를 나열만 합니다.
  자동으로 하나를 고르지 않는 이유는 잘못된 버전을 확정 처리하는 게 더 위험하기 때문 — 이런
  케이스가 반복되면 `gVersionTable` 키를 만드는 시점(1단계)에서부터 별도 처리(예: 상위 회로가
  실제로 참조하는 라이브러리만 남기고 필터링)를 검토하세요.
- **`.net` 문법은 사이트마다 다를 수 있음**: 위 정규식(`^[ \t]*subckt[ \t]+...`)과 주석 문자(`//`)는
  Spectre 기본 표기를 가정한 것입니다. 사내 넷리스터가 `.SUBCKT`/SPICE 호환 모드로 `.net`을 뽑거나,
  주석 문자로 `*`를 허용하는 설정이면 `annotateNetWithICMVersion` 호출 시 `subcktRegex`/`commentChar`
  인자를 바꿔서 쓰면 됩니다 (공통 로직 `annotateNetlistWithICMVersion`을 그대로 재사용).
- **CDL 라인 연속(+)**: CDL은 긴 서브서킷 정의 시 `+`로 줄을 잇는 경우가 있음. `.SUBCKT` 라인
  자체를 찾는 정규식만 쓰므로 이 부분은 문제되지 않지만, 사내 CDL 포맷이 표준과 다르면
  정규식을 실제 파일에 맞게 조정할 것.
- **`ends` 라인에는 주석을 달지 않음**: 현재는 `subckt`/`.SUBCKT` 정의 시작 위에만 버전을 주석으로
  남깁니다. 종료 라인(`.ENDS`/`ends`)까지 표시하고 싶으면 별도 정규식을 추가해야 합니다.
