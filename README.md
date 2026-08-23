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

## 탭 2: 200일선 대시보드

- 데이터: 네이버 증권 비공식 차트 API (`fchart.stock.naver.com/sise.nhn`, XML 응답)
- 탭 1과 동일하게 `CORS_PROXIES`를 경유해서 요청합니다.
- 종목: KODEX 200, TIGER 미국S&P500, ACE KRX금현물, SK하이닉스 (코드는 `js/app.js`의
  `MA200_ITEMS`에서 수정/추가 가능)
- 종목별로 다음을 계산해 카드 형태로 표시합니다.
  - 200일 이동평균선 대비 괴리율
  - 사이클 고점(직전에 종가가 200일선을 하회한 시점 이후 고점) 대비 낙폭
  - 최근 1년(250 영업일) 고점 대비 낙폭
  - 최근 90일 종가/200일선 미니 차트
- 카드를 클릭하면 네이버 증권 모바일 종목 페이지로 이동합니다.

## 탭 3

추후 기능이 정해지면 `index.html`의 `.tab-btn` / `.tab-panel` 쌍을 추가하고
`disabled` 속성을 제거하는 방식으로 확장하면 됩니다.

## 진행 상황

- [x] 탭 구조 + 탭 1(지수·환율 종가 차트) 구현, 헤드리스 브라우저로 UI 동작 확인
- [x] 별도 저장소(`heepaper/stock-webapp`)로 분리
- [x] GitHub Pages 공개 URL 발급 (`Settings → Pages → Source: GitHub Actions` 활성화 후 배포 성공)
- [x] 탭 2(200일선 대시보드) 구현 — 계산/렌더링 로직은 헤드리스 브라우저로 검증,
      실제 네이버 API 응답은 개발 환경의 네트워크 제한으로 미검증 (배포 후 확인 필요)
- [ ] 탭 3 기능 정의 및 구현
