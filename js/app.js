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
