# Stock Webapp

빌드 없이 브라우저에서 바로 동작하는 정적 HTML/JS 주식 웹앱입니다.

## 실행 방법

리포지토리 루트에서:

```
cd stock-webapp
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 접속. (`index.html`을 파일로 바로 열어도 되지만,
일부 브라우저는 `file://`에서 fetch를 제한할 수 있어 로컬 서버 실행을 권장합니다.)

## 구성

- `index.html` — 탭 구조를 가진 메인 페이지
- `css/style.css` — 스타일
- `js/app.js` — 탭 전환 로직 + 차트 데이터 조회/렌더링

## 탭 1: 지수 · 환율

- 데이터: Yahoo Finance 비공식 chart API (`query1.finance.yahoo.com/v8/finance/chart/...`)
- Yahoo API가 브라우저 CORS를 허용하지 않으므로 공개 CORS 프록시(allorigins.win,
  실패 시 corsproxy.io)를 경유해서 요청합니다. 프록시는 제3자 무료 서비스라 간헐적으로
  느리거나 다운될 수 있습니다 — 계속 문제가 되면 `js/app.js`의 `CORS_PROXIES` 배열에
  다른 프록시를 추가하거나, 직접 백엔드를 두는 방식으로 바꾸는 걸 권장합니다.
- 종목: KOSPI, KOSDAQ, S&P 500, 다우존스, 나스닥, USD/EUR/JPY/CNY-KRW 환율
- 기간: 1개월 ~ 5년

## 탭 2, 3

추후 기능이 정해지면 `index.html`의 `.tab-btn` / `.tab-panel` 쌍을 추가하고
`disabled` 속성을 제거하는 방식으로 확장하면 됩니다.

## 진행 상황

- [x] 탭 구조 + 탭 1(지수·환율 종가 차트) 구현, 헤드리스 브라우저로 UI 동작 확인
- [x] 이 저장소(`heepaper/Heepaper-claude-code`)의 `stock-webapp` 폴더로 커밋
- [ ] 별도 저장소(`heepaper/stock-webapp`)로 분리 시도 — 세션 권한 승인 문제로 보류
- [ ] GitHub Pages로 공개 URL 발급 (저장소를 public으로 전환해야 함)
- [ ] 탭 2, 3 기능 정의 및 구현
