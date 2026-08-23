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
const MA200_ITEMS = [
  { key: "kodex200", name: "KODEX 200", code: "069500" },
  { key: "snp500", name: "TIGER 미국S&P500", code: "360750" },
  { key: "gold", name: "ACE KRX금현물", code: "411060" },
  { key: "hynix", name: "SK하이닉스", code: "000660" },
];

const ma200RefreshBtn = document.getElementById("ma200RefreshBtn");
const ma200StatusMsg = document.getElementById("ma200StatusMsg");
const ma200Cards = document.getElementById("ma200Cards");

let ma200Loaded = false;
const ma200Charts = {};

function naverStockUrl(code) {
  return `https://m.stock.naver.com/domestic/stock/${code}/total`;
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

async function fetchMa200Item(item) {
  const xml = await fetchTextViaProxies(naverChartApiUrl(item.code));
  const { dates, closes } = parseNaverChartXml(xml);
  if (closes.length === 0) throw new Error("데이터가 없습니다");
  return { ...item, dates, closes };
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
  card.href = naverStockUrl(item.code);
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.id = `ma200-card-${item.key}`;

  card.innerHTML = `
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
  return card;
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

  MA200_ITEMS.forEach((item) => ma200Cards.appendChild(buildMa200Card(item)));

  const results = await Promise.allSettled(MA200_ITEMS.map(fetchMa200Item));

  let errorCount = 0;
  results.forEach((result, idx) => {
    const item = MA200_ITEMS[idx];
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
      ? `${MA200_ITEMS.length}개 종목 업데이트 완료`
      : `${errorCount}개 종목 데이터를 불러오지 못했습니다`,
    errorCount > 0
  );
  ma200RefreshBtn.disabled = false;
}

ma200RefreshBtn.addEventListener("click", loadMa200Dashboard);

document.querySelectorAll(".tab-btn").forEach((btn) => {
  if (btn.dataset.tab !== "tab-ma200") return;
  btn.addEventListener("click", () => {
    if (ma200Loaded) return;
    ma200Loaded = true;
    loadMa200Dashboard();
  });
});
