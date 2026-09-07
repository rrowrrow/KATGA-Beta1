import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(window.firebaseConfig);
const db = getFirestore(app);
const PLAYER_PAGE_SIZE = 10;
const PLAYER_LIMIT = 100;
let topPlayers = [];
let currentPlayerPage = 1;
let dailyChartInstance = null;

async function loadDashboard() {
  try {
    const snapshot = await getDocs(collection(db, "results"));
    const results = snapshot.docs.map(doc => doc.data());
    const summary = buildSummary(results);
    topPlayers = buildPlayerStats(results).slice(0, PLAYER_LIMIT);
    const units = buildUnitStats(results).slice(0, 10);
    const dailyStats = buildDailyStats(results);

    renderSummary(summary);
    renderPlayerPage(1);
    renderUnitLeaderboard(units);
    renderDailyChart(dailyStats);
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    document.getElementById("summary").innerHTML = '<div class="kpi-card"><span>Status</span><strong>Gagal</strong><small>Dashboard tidak dapat dimuat.</small></div>';
    document.getElementById("playerTableBody").innerHTML = '<tr><td colspan="6" class="empty-state">Gagal memuat data pemain.</td></tr>';
    document.getElementById("unitLeaderboard").innerHTML = '<div class="empty-state">Gagal memuat data unit.</div>';
  }
}

function buildSummary(results) {
  const totalGames = results.length;
  const wins = results.filter(r => r.result === "win").length;
  const uniquePlayers = new Set(results.map(r => r.playerId || r.name).filter(Boolean)).size;
  const uniqueUnits = new Set(results.map(r => (r.unit || "").trim()).filter(Boolean)).size;
  return { totalGames, uniquePlayers, uniqueUnits, winRate: totalGames ? wins / totalGames * 100 : 0 };
}

function buildPlayerStats(results) {
  const map = new Map();
  results.forEach(r => {
    const name = (r.name || "Anonim").trim() || "Anonim";
    const key = r.playerId || name;
    const unit = (r.unit || "Tidak Diketahui").trim() || "Tidak Diketahui";
    if (!map.has(key)) map.set(key, { name, unit, games: 0, wins: 0 });
    const p = map.get(key);
    p.games += 1;
    if (r.result === "win") p.wins += 1;
    if (name !== "Anonim") p.name = name;
    if (unit !== "Tidak Diketahui") p.unit = unit;
  });

  return [...map.values()]
    .map(p => ({ ...p, winRate: p.games ? p.wins / p.games * 100 : 0 }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name, "id"));
}

function buildUnitStats(results) {
  const map = new Map();
  results.forEach(r => {
    const name = (r.unit || "Tidak Diketahui").trim() || "Tidak Diketahui";
    if (!map.has(name)) map.set(name, { unit: name, games: 0, wins: 0 });
    const u = map.get(name);
    u.games += 1;
    if (r.result === "win") u.wins += 1;
  });

  return [...map.values()]
    .map(u => ({ ...u, winRate: u.games ? u.wins / u.games * 100 : 0 }))
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.games - a.games || a.unit.localeCompare(b.unit, "id"));
}

function buildDailyStats(results) {
  const stats = {};
  results.forEach(r => {
    const date = r.date || "Tidak Diketahui";
    stats[date] = (stats[date] || 0) + 1;
  });
  return stats;
}

function renderSummary(s) {
  const cards = [
    ["Total Game", s.totalGames, "Seluruh hasil tersimpan"],
    ["Pemain", s.uniquePlayers, "Pemain unik"],
    ["Unit", s.uniqueUnits, "Unit terdaftar"],
    ["Win Rate", `${fmt(s.winRate)}%`, "Keseluruhan permainan"]
  ];
  document.getElementById("summary").innerHTML = cards.map(([label, value, helper]) => `
    <div class="kpi-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(helper)}</small></div>
  `).join("");
}

function renderPlayerPage(page) {
  const totalPages = Math.max(1, Math.ceil(topPlayers.length / PLAYER_PAGE_SIZE));
  currentPlayerPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPlayerPage - 1) * PLAYER_PAGE_SIZE;
  const players = topPlayers.slice(start, start + PLAYER_PAGE_SIZE);
  const body = document.getElementById("playerTableBody");

  body.innerHTML = players.length ? players.map((p, i) => {
    const rank = start + i + 1;
    return `<tr>
      <td><span class="rank-badge ${rank <= 3 ? `rank-${rank}` : ""}">${rank}</span></td>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.unit)}</td><td>${p.wins}</td><td>${p.games}</td><td><strong>${fmt(p.winRate)}%</strong></td>
    </tr>`;
  }).join("") : '<tr><td colspan="6" class="empty-state">Belum ada data pemain.</td></tr>';

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const el = document.getElementById("playerPagination");
  if (topPlayers.length <= PLAYER_PAGE_SIZE) { el.innerHTML = ""; return; }
  const numbers = Array.from({ length: totalPages }, (_, i) => i + 1).map(p =>
    `<button class="page-btn ${p === currentPlayerPage ? "active" : ""}" data-page="${p}">${p}</button>`
  ).join("");
  el.innerHTML = `
    <button class="page-btn nav" data-page="${currentPlayerPage - 1}" ${currentPlayerPage === 1 ? "disabled" : ""}>‹</button>
    <div class="page-number-group">${numbers}</div>
    <button class="page-btn nav" data-page="${currentPlayerPage + 1}" ${currentPlayerPage === totalPages ? "disabled" : ""}>›</button>`;
  el.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => {
    const target = Number(btn.dataset.page);
    if (target >= 1 && target <= totalPages) renderPlayerPage(target);
  }));
}

function renderUnitLeaderboard(units) {
  const el = document.getElementById("unitLeaderboard");
  el.innerHTML = units.length ? units.map((u, i) => {
    const rank = i + 1;
    return `<div class="unit-row">
      <span class="rank-badge ${rank <= 3 ? `rank-${rank}` : ""}">${rank}</span>
      <div class="unit-main"><strong>${esc(u.unit)}</strong><span>${u.wins} menang dari ${u.games} game</span></div>
      <div class="unit-rate"><strong>${fmt(u.winRate)}%</strong><span>Win rate</span></div>
    </div>`;
  }).join("") : '<div class="empty-state">Belum ada data unit.</div>';
}

function renderDailyChart(stats) {
  const canvas = document.getElementById("dailyChart");
  const labels = Object.keys(stats).filter(d => d !== "Tidak Diketahui").sort();
  const values = labels.map(d => stats[d]);
  if (dailyChartInstance) dailyChartInstance.destroy();
  dailyChartInstance = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ label: "Jumlah Game", data: values, backgroundColor: "#0284c7", borderRadius: 8, maxBarThickness: 44 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#64748b" } },
        y: { beginAtZero: true, ticks: { precision: 0, color: "#64748b" }, grid: { color: "rgba(148,163,184,.18)" } }
      }
    }
  });
}

function fmt(v) { return Number(v || 0).toFixed(1); }
function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

loadDashboard();
