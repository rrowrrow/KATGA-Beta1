import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-6lfqdfOzqfoDp118bpvi7SmNufTU9B",
  authDomain: "katga-bd583.firebaseapp.com",
  projectId: "katga-bd583",
  storageBucket: "katga-bd583.firebasestorage.app",
  messagingSenderId: "70271543625",
  appId: "1:70271543625:web:f4fa186d5d98391b95d298",
  measurementId: "G-QB23BTQYPV"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

async function loadDashboard() {

  try {

    const snapshot =
      await getDocs(
        collection(
          db,
          "results"
        )
      );

    const results =
      snapshot.docs.map(
        doc => doc.data()
      );

    const totalGames =
      results.length;

    const wins =
      results.filter(
        r => r.result === "win"
      ).length;

    const loses =
      results.filter(
        r => r.result === "lose"
      ).length;

    const uniquePlayers =
      new Set(
        results.map(
          r => r.playerId
        )
      ).size;

    const winRate =
      totalGames
        ? (
            wins /
            totalGames *
            100
          ).toFixed(1)
        : 0;

    const unitStats = {};
    const playerStats = {};
    const dailyStats = {};

    results.forEach(result => {

      const unit =
        result.unit ||
        "Tidak Diketahui";

      unitStats[unit] =
        (unitStats[unit] || 0) + 1;

      const date =
        result.date ||
        "Tidak Diketahui";

      dailyStats[date] =
        (dailyStats[date] || 0) + 1;

      if (result.result === "win") {

        const player =
          result.name ||
          "Anonim";

        playerStats[player] =
          (playerStats[player] || 0) + 1;

      }

    });

    const unitHtml =
      Object.entries(unitStats)
        .sort(
          (a, b) => b[1] - a[1]
        )
        .map(
          ([unit, count]) => `
            <div class="card">
              ${unit}: ${count}
            </div>
          `
        )
        .join("");

    const topUnitHtml =
      Object.entries(unitStats)
        .sort(
          (a, b) => b[1] - a[1]
        )
        .slice(0, 10)
        .map(
          ([unit, count], index) => `
            <div class="card">
              ${index + 1}. ${unit}
              (${count} game)
            </div>
          `
        )
        .join("");

    const playerHtml =
      Object.entries(playerStats)
        .sort(
          (a, b) => b[1] - a[1]
        )
        .slice(0, 10)
        .map(
          ([player, wins], index) => `
            <div class="card">
              ${index + 1}. ${player}
              (${wins} kemenangan)
            </div>
          `
        )
        .join("");

    const dailyHtml =
      Object.entries(dailyStats)
        .sort(
          (a, b) =>
            b[0].localeCompare(a[0])
        )
        .map(
          ([date, count]) => `
            <div class="card">
              ${date}: ${count} game
            </div>
          `
        )
        .join("");

    const chartLabels =
      Object.keys(dailyStats)
        .sort();

    const chartValues =
      chartLabels.map(
        date => dailyStats[date]
      );

    document.getElementById(
      "summary"
    ).innerHTML = `

      <div class="card">
        Total Game: ${totalGames}
      </div>

      <div class="card">
        Pemain Unik: ${uniquePlayers}
      </div>

      <div class="card">
        Menang: ${wins}
      </div>

      <div class="card">
        Kalah: ${loses}
      </div>

      <div class="card">
        Win Rate: ${winRate}%
      </div>

      <h2>Partisipasi per Unit</h2>

      ${unitHtml}

      <h2>Top Pemain</h2>

      ${playerHtml}

      <h2>Partisipasi Harian</h2>

      ${dailyHtml}

      <h2>Top Unit</h2>

      ${topUnitHtml}

    `;

    const chartCanvas =
      document.getElementById(
        "dailyChart"
      );

    if (chartCanvas) {

      new Chart(
        chartCanvas,
        {
          type: "bar",
          data: {
            labels: chartLabels,
            datasets: [
              {
                label: "Jumlah Game",
                data: chartValues,
                backgroundColor: "#00529b"
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        }
      );

    }

  } catch (error) {

    console.error(
      "DASHBOARD ERROR:",
      error
    );

    document.getElementById(
      "summary"
    ).innerHTML = `
      <div class="card">
        Gagal memuat dashboard.
      </div>
    `;

  }

}

loadDashboard();
