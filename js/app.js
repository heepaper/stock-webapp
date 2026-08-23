// ---- Tab switching ----
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ---- Tab 1: index / FX closing price chart ----
const symbolSelect = document.getElementById("symbolSelect");
const rangeSelect = document.getElementById("rangeSelect");
const loadBtn = document.getElementById("loadBtn");
const statusMsg = document.getElementById("statusMsg");

let priceChart = null;

// Yahoo Finance chart API has no reliable CORS headers for browser fetches,
// so requests are routed through a public CORS proxy. Two proxies are tried
// in order since free proxies are occasionally rate-limited or down.
const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

function intervalForRange(range) {
  return range === "5y" ? "1wk" : "1d";
}

function yahooChartApiUrl(symbol, range) {
  const interval = intervalForRange(range);
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
}

async function fetchViaProxies(targetUrl) {
  let lastError;
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(targetUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("모든 프록시 요청 실패");
}

function setStatus(text, isError) {
  statusMsg.textContent = text;
  statusMsg.classList.toggle("error", Boolean(isError));
}

function formatDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return d.toISOString().slice(0, 10);
}

async function loadChart() {
  const symbol = symbolSelect.value;
  const range = rangeSelect.value;

  loadBtn.disabled = true;
  setStatus("불러오는 중...");

  try {
    const data = await fetchViaProxies(yahooChartApiUrl(symbol, range));

    const result = data?.chart?.result?.[0];
    const error = data?.chart?.error;
    if (error) {
      throw new Error(error.description || "데이터 조회 오류");
    }
    if (!result) {
      throw new Error("데이터가 없습니다");
    }

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];

    const labels = [];
    const values = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] === null || closes[i] === undefined) continue;
      labels.push(formatDate(timestamps[i]));
      values.push(Number(closes[i].toFixed(2)));
    }

    if (values.length === 0) {
      throw new Error("표시할 데이터가 없습니다");
    }

    renderChart(symbolSelect.options[symbolSelect.selectedIndex].text, labels, values);
    setStatus(`마지막 업데이트: ${labels[labels.length - 1]} · 종가 ${values[values.length - 1]}`);
  } catch (err) {
    setStatus(`데이터를 불러오지 못했습니다: ${err.message}`, true);
  } finally {
    loadBtn.disabled = false;
  }
}

function renderChart(label, labels, values) {
  const ctx = document.getElementById("priceChart").getContext("2d");

  if (priceChart) {
    priceChart.destroy();
  }

  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${label} 종가`,
          data: values,
          borderColor: "#4f8cff",
          backgroundColor: "rgba(79, 140, 255, 0.15)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: { color: "#9aa0a8", maxTicksLimit: 10 },
          grid: { color: "#2a2e37" },
        },
        y: {
          ticks: { color: "#9aa0a8" },
          grid: { color: "#2a2e37" },
        },
      },
      plugins: {
        legend: { labels: { color: "#e8eaed" } },
      },
    },
  });
}

loadBtn.addEventListener("click", loadChart);
window.addEventListener("DOMContentLoaded", loadChart);

// ---- Tab 2: 200-day MA / cycle & 1-year high drawdown dashboard ----
const MA200_DEFAULT_ITEMS = [
  { key: "kr-069500", name: "KODEX 200", code: "069500", market: "kr" },
  { key: "kr-360750", name: "TIGER 미국S&P500", code: "360750", market: "kr" },
  { key: "kr-411060", name: "ACE KRX금현물", code: "411060", market: "kr" },
  { key: "kr-000660", name: "SK하이닉스", code: "000660", market: "kr" },
];
const MA200_STORAGE_KEY = "ma200_items_v1";

const ma200RefreshBtn = document.getElementById("ma200RefreshBtn");
const ma200StatusMsg = document.getElementById("ma200StatusMsg");
const ma200Cards = document.getElementById("ma200Cards");
const ma200AddToggleBtn = document.getElementById("ma200AddToggleBtn");
const ma200AddPanel = document.getElementById("ma200AddPanel");
const ma200MarketSelect = document.getElementById("ma200MarketSelect");
const ma200SearchInput = document.getElementById("ma200SearchInput");
const ma200SearchBtn = document.getElementById("ma200SearchBtn");
const ma200DirectAddBtn = document.getElementById("ma200DirectAddBtn");
const ma200SearchResults = document.getElementById("ma200SearchResults");
const ma200AddMsg = document.getElementById("ma200AddMsg");

let ma200Loaded = false;
const ma200Charts = {};

function loadMa200ItemList() {
  try {
    const raw = localStorage.getItem(MA200_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (err) {
    // corrupt/unavailable storage — fall back to defaults
  }
  return null;
}

function saveMa200ItemList() {
  try {
    localStorage.setItem(MA200_STORAGE_KEY, JSON.stringify(ma200ItemList));
  } catch (err) {
    // storage unavailable (private mode, quota, etc.) — in-memory state still works
  }
}

let ma200ItemList = loadMa200ItemList() || MA200_DEFAULT_ITEMS.slice();

function naverStockUrl(code) {
  return `https://m.stock.naver.com/domestic/stock/${code}/total`;
}

function yahooFinanceUrl(symbol) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
}

function naverChartApiUrl(code) {
  return `https://fchart.stock.naver.com/sise.nhn?symbol=${encodeURIComponent(code)}&timeframe=day&count=300&requestType=0`;
}

async function fetchTextViaProxies(targetUrl) {
  let lastError;
  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const res = await fetch(buildProxyUrl(targetUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("모든 프록시 요청 실패");
}

function parseNaverChartXml(xml) {
  const matches = xml.match(/<item data="([^"]+)"/g);
  if (!matches) return { dates: [], closes: [] };

  const dates = [];
  const closes = [];
  matches.forEach((m) => {
    const raw = m.replace('<item data="', "").replace('"', "");
    const parts = raw.split("|");
    const close = parseFloat(parts[4]);
    if (!isNaN(close) && close > 0) {
      dates.push(parts[0]);
      closes.push(close);
    }
  });
  return { dates, closes };
}

async function fetchUsCloses(symbol) {
  const data = await fetchViaProxies(yahooChartApiUrl(symbol, "2y"));
  const result = data?.chart?.result?.[0];
  const error = data?.chart?.error;
  if (error) throw new Error(error.description || "데이터 조회 오류");
  if (!result) throw new Error("데이터가 없습니다");

  const timestamps = result.timestamp || [];
  const rawCloses = result.indicators?.quote?.[0]?.close || [];
  const dates = [];
  const closes = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (rawCloses[i] === null || rawCloses[i] === undefined) continue;
    dates.push(formatDate(timestamps[i]));
    closes.push(Number(rawCloses[i]));
  }
  return { dates, closes, meta: result.meta };
}

async function fetchMa200Item(item) {
  if (item.market === "us") {
    const { dates, closes } = await fetchUsCloses(item.code);
    if (closes.length === 0) throw new Error("표시할 데이터가 없습니다");
    return { ...item, dates, closes };
  }

  const xml = await fetchTextViaProxies(naverChartApiUrl(item.code));
  const { dates, closes } = parseNaverChartXml(xml);
  if (closes.length === 0) throw new Error("데이터가 없습니다");
  return { ...item, dates, closes };
}

// ---- Naver autocomplete search (best-effort; unofficial/undocumented API) ----
function naverAutoCompleteUrl(query) {
  return `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&q_enc=utf-8&st=111&frm=stock&r_format=json&r_enc=utf-8&r_unicode=0&t_koreng=1&run=2`;
}

async function searchKrStocks(query) {
  const text = await fetchTextViaProxies(naverAutoCompleteUrl(query));
  const data = JSON.parse(text);
  const groups = Array.isArray(data.items) ? data.items : [];
  const results = [];
  groups.forEach((group) => {
    if (!Array.isArray(group)) return;
    group.forEach((entry) => {
      if (!Array.isArray(entry)) return;
      const code = entry[0];
      const name = entry[1];
      if (typeof code === "string" && /^\d{6}$/.test(code) && name) {
        results.push({ code, name });
      }
    });
  });
  return results;
}

// ---- Yahoo Finance search (US tickers) ----
function yahooSearchUrl(query) {
  return `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=8&newsCount=0`;
}

async function searchUsStocks(query) {
  const data = await fetchViaProxies(yahooSearchUrl(query));
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  return quotes
    .filter((q) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"))
    .map((q) => ({ code: q.symbol, name: q.shortname || q.longname || q.symbol }));
}

function computeMA200(closes) {
  const ma = new Array(closes.length).fill(NaN);
  for (let i = 199; i < closes.length; i++) {
    let sum = 0;
    for (let j = 0; j < 200; j++) sum += closes[i - j];
    ma[i] = sum / 200;
  }
  return ma;
}

function computeCycleMDD(closes, ma) {
  const len = closes.length;
  let cycleStartIndex = 0;
  for (let i = len - 1; i >= 0; i--) {
    if (!isNaN(ma[i]) && closes[i] < ma[i]) {
      cycleStartIndex = i;
      break;
    }
  }
  const cycleCloses = closes.slice(cycleStartIndex);
  const cyclePeak = cycleCloses.length > 0 ? Math.max(...cycleCloses) : closes[len - 1];
  const curPrice = closes[len - 1];
  return ((curPrice - cyclePeak) / cyclePeak) * 100;
}

function computeYearMDD(closes) {
  const len = closes.length;
  const yearCloses = closes.slice(-250);
  const yearPeak = Math.max(...yearCloses);
  const curPrice = closes[len - 1];
  return ((curPrice - yearPeak) / yearPeak) * 100;
}

function buildMa200Card(item) {
  const card = document.createElement("a");
  card.className = "stock-card";
  card.href = item.market === "us" ? yahooFinanceUrl(item.code) : naverStockUrl(item.code);
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.id = `ma200-card-${item.key}`;

  card.innerHTML = `
    <button class="stock-card-remove" type="button" title="삭제">×</button>
    <div class="stock-card-chart">
      <canvas id="ma200-chart-${item.key}" width="160" height="60"></canvas>
    </div>
    <div class="stock-card-info">
      <div class="stock-card-name">${item.name}</div>
      <div class="stock-card-gap" data-field="gap">불러오는 중...</div>
      <div class="stock-card-mdd-row">
        <span data-field="cycleMdd"></span>
        <span class="stock-card-mdd-sep"> | </span>
        <span data-field="yearMdd"></span>
      </div>
      <div class="stock-card-price-row">
        <span class="stock-card-price" data-field="price"></span>
        <span class="stock-card-slash"> / </span>
        <span class="stock-card-ma" data-field="ma"></span>
      </div>
    </div>
  `;

  card.querySelector(".stock-card-remove").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeMa200Item(item.key);
  });

  return card;
}

function removeMa200Item(key) {
  ma200ItemList = ma200ItemList.filter((it) => it.key !== key);
  saveMa200ItemList();
  if (ma200Charts[key]) {
    ma200Charts[key].destroy();
    delete ma200Charts[key];
  }
  document.getElementById(`ma200-card-${key}`)?.remove();
}

function renderMa200Card(data) {
  const ma = computeMA200(data.closes);
  const maVal = ma[ma.length - 1];
  const price = data.closes[data.closes.length - 1];
  const gap = ((price - maVal) / maVal) * 100;
  const cycleMdd = computeCycleMDD(data.closes, ma);
  const yearMdd = computeYearMDD(data.closes);

  const card = document.getElementById(`ma200-card-${data.key}`);
  if (!card) return;

  const gapEl = card.querySelector('[data-field="gap"]');
  gapEl.textContent = `괴리율: ${gap >= 0 ? "+" : ""}${gap.toFixed(1)}%`;
  gapEl.classList.toggle("positive", gap >= 0);
  gapEl.classList.toggle("negative", gap < 0);

  card.querySelector('[data-field="cycleMdd"]').textContent = `사이클 ${cycleMdd.toFixed(1)}%`;

  const yearEl = card.querySelector('[data-field="yearMdd"]');
  yearEl.textContent = `1년 ${yearMdd.toFixed(1)}%`;
  yearEl.classList.toggle("negative", yearMdd <= -10);

  card.querySelector('[data-field="price"]').textContent = `${Math.round(price).toLocaleString()}원`;
  card.querySelector('[data-field="ma"]').textContent = `${Math.round(maVal).toLocaleString()}원`;

  const SIZE = 90;
  const labels = data.dates.slice(-SIZE);
  const priceSet = data.closes.slice(-SIZE);
  const maSet = ma.slice(-SIZE);

  const ctx = document.getElementById(`ma200-chart-${data.key}`).getContext("2d");
  if (ma200Charts[data.key]) {
    ma200Charts[data.key].destroy();
  }
  ma200Charts[data.key] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: priceSet,
          borderColor: "#80dfff",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.15,
        },
        {
          data: maSet,
          borderColor: "#afd485",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      scales: { x: { display: false }, y: { display: false } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });
}

function setMa200Status(text, isError) {
  ma200StatusMsg.textContent = text;
  ma200StatusMsg.classList.toggle("error", Boolean(isError));
}

async function loadMa200Dashboard() {
  ma200RefreshBtn.disabled = true;
  setMa200Status("불러오는 중...");
  ma200Cards.innerHTML = "";

  ma200ItemList.forEach((item) => ma200Cards.appendChild(buildMa200Card(item)));

  const results = await Promise.allSettled(ma200ItemList.map(fetchMa200Item));

  let errorCount = 0;
  results.forEach((result, idx) => {
    const item = ma200ItemList[idx];
    if (result.status === "fulfilled") {
      renderMa200Card(result.value);
    } else {
      errorCount++;
      const card = document.getElementById(`ma200-card-${item.key}`);
      const gapEl = card?.querySelector('[data-field="gap"]');
      if (gapEl) gapEl.textContent = `⚠️ 데이터 수신 실패`;
    }
  });

  setMa200Status(
    errorCount === 0
      ? `${ma200ItemList.length}개 종목 업데이트 완료`
      : `${errorCount}개 종목 데이터를 불러오지 못했습니다`,
    errorCount > 0
  );
  ma200RefreshBtn.disabled = false;
}

async function addMa200Item({ name, code, market }) {
  const key = `${market}-${code}`;
  if (ma200ItemList.some((it) => it.key === key)) {
    ma200AddMsg.textContent = "이미 추가된 종목입니다.";
    return;
  }

  const item = { key, name: name || code, code, market };
  ma200ItemList.push(item);
  saveMa200ItemList();

  ma200Cards.appendChild(buildMa200Card(item));
  ma200AddMsg.textContent = `${item.name} 추가됨 · 불러오는 중...`;

  try {
    const data = await fetchMa200Item(item);
    renderMa200Card(data);
    ma200AddMsg.textContent = `${item.name} 추가 완료`;
  } catch (err) {
    const card = document.getElementById(`ma200-card-${item.key}`);
    const gapEl = card?.querySelector('[data-field="gap"]');
    if (gapEl) gapEl.textContent = "⚠️ 데이터 수신 실패";
    ma200AddMsg.textContent = `${item.name} 데이터 조회 실패: ${err.message}`;
  }
}

function renderMa200SearchResults(results, market) {
  ma200SearchResults.innerHTML = "";
  if (results.length === 0) {
    ma200SearchResults.textContent = "검색 결과가 없습니다. 코드/티커를 알고 있다면 '코드/티커로 바로 추가'를 이용해주세요.";
    return;
  }
  results.slice(0, 8).forEach((r) => {
    const row = document.createElement("div");
    row.className = "ma200-search-result-row";

    const label = document.createElement("span");
    label.textContent = r.name;
    const codeSpan = document.createElement("span");
    codeSpan.className = "ma200-search-result-code";
    codeSpan.textContent = r.code;
    label.appendChild(codeSpan);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "추가";
    addBtn.addEventListener("click", () => addMa200Item({ name: r.name, code: r.code, market }));

    row.appendChild(label);
    row.appendChild(addBtn);
    ma200SearchResults.appendChild(row);
  });
}

ma200RefreshBtn.addEventListener("click", loadMa200Dashboard);

ma200AddToggleBtn.addEventListener("click", () => {
  ma200AddPanel.hidden = !ma200AddPanel.hidden;
});

ma200SearchBtn.addEventListener("click", async () => {
  const market = ma200MarketSelect.value;
  const query = ma200SearchInput.value.trim();
  if (!query) {
    ma200AddMsg.textContent = "검색어를 입력해주세요.";
    return;
  }

  ma200AddMsg.textContent = "검색 중...";
  ma200SearchResults.innerHTML = "";
  ma200SearchBtn.disabled = true;
  try {
    const results = market === "us" ? await searchUsStocks(query) : await searchKrStocks(query);
    ma200AddMsg.textContent = "";
    renderMa200SearchResults(results, market);
  } catch (err) {
    ma200AddMsg.textContent = `검색 실패: ${err.message} (코드/티커를 알고 있다면 '코드/티커로 바로 추가'를 이용해주세요)`;
  } finally {
    ma200SearchBtn.disabled = false;
  }
});

ma200DirectAddBtn.addEventListener("click", () => {
  const market = ma200MarketSelect.value;
  const raw = ma200SearchInput.value.trim();
  if (!raw) {
    ma200AddMsg.textContent = "코드 또는 티커를 입력해주세요.";
    return;
  }
  if (market === "kr" && !/^\d{6}$/.test(raw)) {
    ma200AddMsg.textContent = "한국 종목 코드는 6자리 숫자여야 합니다. (예: 005930)";
    return;
  }
  const code = market === "us" ? raw.toUpperCase() : raw;
  addMa200Item({ name: code, code, market });
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  if (btn.dataset.tab !== "tab-ma200") return;
  btn.addEventListener("click", () => {
    if (ma200Loaded) return;
    ma200Loaded = true;
    loadMa200Dashboard();
  });
});
