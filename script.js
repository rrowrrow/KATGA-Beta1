const STORAGE_KEY = "katga_beta_v1";
const CONFIG_URL = "./data/config.json";
const DAILY_PATH = "./data/daily/";
const WORD_PATH = "./data/";
const DEV_MODE = location.search.includes("dev=true");
const state = {
  config: null,
  todayKey: "",
  todayData: null,
  answer: "",
  maxAttempts: 6,
  attempts: [],
  current: "",
  locked: false,
  result: "playing",
  hasSharedToday: false,
  popupQueue: [],
  popupOpen: false,
  validGuessSet: new Set(),
  hasReadMessage: false,
  returnFromDashboard: false,
};

const els = {};
let toastTimer = null;
document.addEventListener("DOMContentLoaded", () => {
  mapElements();
  bindEvents();
  init();
});

function mapElements() {
  els.streakCount = document.getElementById("streakCount");
  els.bestCount = document.getElementById("bestCount");
  els.statusLabel = document.getElementById("statusLabel");
  els.dateLabel = document.getElementById("dateLabel");
  els.readerSection = document.getElementById("readerSection");
  els.messageTitle = document.getElementById("messageTitle");
  els.messageCategory = document.getElementById("messageCategory");
  els.messageFullText = document.getElementById("messageFullText");
  els.messageScrollBox = document.getElementById("messageScrollBox");
  els.confirmRead = document.getElementById("confirmRead");
  els.startGameBtn = document.getElementById("startGameBtn");
  els.readerHint = document.getElementById("readerHint");
  els.gameSection = document.getElementById("gameSection");
  els.wordLengthBadge = document.getElementById("wordLengthBadge");
  els.gameHint = document.getElementById("gameHint");
  els.feedback = document.getElementById("feedback");
  els.board = document.getElementById("board");
  els.keyboard = document.getElementById("keyboard");
  els.helpBtn = document.getElementById("helpBtn");
  els.shareBtn = document.getElementById("shareBtn");
  els.dashboardBtn = document.getElementById("dashboardBtn");
  els.aboutBtn = document.getElementById("aboutBtn");
  els.modalOverlay = document.getElementById("modalOverlay");
  els.modalEyebrow = document.getElementById("modalEyebrow");
  els.modalTitle = document.getElementById("modalTitle");
  els.modalBody = document.getElementById("modalBody");
  els.modalActions = document.getElementById("modalActions");
  els.modalCloseBtn = document.getElementById("modalCloseBtn");
  els.toast = document.getElementById("toast");
}

function bindEvents() {
  els.messageScrollBox.addEventListener("scroll", handleMessageScroll);
  els.confirmRead.addEventListener("change", updateStartButtonState);
  els.startGameBtn.addEventListener("click", startGame);
  els.helpBtn.addEventListener("click", openGuideModal);

  // MENGARAHKAN TOMBOL SHARE HEADER KE DUA TINGKAT QUOTE CARD
  els.dashboardBtn.addEventListener("click", () => {
    sessionStorage.setItem("katga_return_from_dashboard", "true");
    window.location.href = "admin.html";
  });

  els.aboutBtn.addEventListener("click", openHelpModal);

  els.modalCloseBtn.addEventListener("click", closeModalAndContinue);
  els.modalOverlay.addEventListener("click", (event) => {
    if (event.target === els.modalOverlay) {
      closeModalAndContinue();
    }
  });

  function checkReturnFromDashboard() {
    const isReturning = sessionStorage.getItem("katga_return_from_dashboard") === "true";

    if (!isReturning) return;

    // Hapus langsung supaya popup hanya muncul sekali
    sessionStorage.removeItem("katga_return_from_dashboard");

    // Hanya tampil kalau game hari ini sudah selesai
    if (!state.locked) return;

    if (state.result !== "win" && state.result !== "lose") return;

    showEducationPopup("Tutup");
  }

  document.getElementById("saveProfileBtn")?.addEventListener("click", saveProfile);

  document.addEventListener("keydown", (event) => {
    if (state.popupOpen) return;
    if (state.locked) return;
    if (!state.hasReadMessage) return;
    if (event.key === "Backspace") {
      removeLastChar();
      return;
    }

    if (event.key === "Enter") {
      submitGuess();
      return;
    }

    if (/^[a-zA-Z]$/.test(event.key)) {
      if (state.current.length >= state.answer.length) return;
      state.current += event.key.toUpperCase();
      renderCurrentRow();
    }
  });
}

async function checkTodayResultFromFirebase() {
  if (!window.db || !window.getDocs || !window.collection || !window.query || !window.where) {
    return null;
  }

  try {
    const playerId = getPlayerId();

    const q = window.query(window.collection(window.db, "results"), window.where("playerId", "==", playerId), window.where("date", "==", state.todayKey));

    const snapshot = await window.getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const completedResult = snapshot.docs.map((doc) => doc.data()).find((data) => data.result === "win" || data.result === "lose");

    return completedResult || null;
  } catch (error) {
    console.error("FIREBASE READ ERROR:", error);
    return null;
  }
}

async function applyFirebaseDailyLock() {
  const devBypass = DEV_MODE && sessionStorage.getItem("katga_dev_bypass_daily_lock") === "true";

  if (devBypass) {
    sessionStorage.removeItem("katga_dev_bypass_daily_lock");
    return;
  }

  const firebaseResult = await checkTodayResultFromFirebase();

  if (!firebaseResult) {
    return;
  }

  if (firebaseResult.result !== "win" && firebaseResult.result !== "lose") {
    return;
  }

  // Firebase hanya mengembalikan status penyelesaian.
  // Detail board tetap berasal dari localStorage.
  state.locked = true;
  state.result = firebaseResult.result;
}

async function init() {
  try {
    const res = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`File ${CONFIG_URL} tidak bisa dibuka`);
    }

    const data = await res.json();
    state.config = data;
    state.maxAttempts = Number.isInteger(data.maxGuesses) ? data.maxGuesses : 6;

    const today = new Date();
    state.todayKey = formatDate(today);

    els.dateLabel.textContent = today.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    let todayData = null;

    try {
      const dailyResponse = await fetch(`${DAILY_PATH}${state.todayKey}.json`, { cache: "no-store" });
      if (dailyResponse.ok) {
        todayData = await dailyResponse.json();
      }
    } catch (error) {
      console.warn("File harian tidak ditemukan");
    }
    if (!todayData) {
      todayData = data.defaultWord;
    }

    state.todayData = todayData;

    if (!state.todayData || !state.todayData.word) {
      throw new Error("Kata harian tidak ditemukan");
    }

    state.answer = normalizeWord(state.todayData.word);
    if (!state.answer) {
      throw new Error("Word harian tidak valid");
    }

    const wordsResponse = await fetch(`${WORD_PATH}words-${state.answer.length}.json`);

    if (!wordsResponse.ok) {
      throw new Error(`Bank kata ${state.answer.length} huruf tidak ditemukan`);
    }

    const validList = await wordsResponse.json();
    state.validGuessSet = new Set(validList.map(normalizeWord).filter(Boolean));

    state.validGuessSet.add(state.answer);
    applyTodayDataToUI();
    restoreProgress();

    await applyFirebaseDailyLock();

    state.returnFromDashboard = sessionStorage.getItem("katga_return_from_dashboard") === "true";

    sessionStorage.removeItem("katga_return_from_dashboard");
    createBoard();
    createKeyboard();
    renderAttempts();
    syncGameState();
    updateStatsUI();

    if (state.returnFromDashboard) {
      state.returnFromDashboard = false;
      showEducationPopup("Tutup");
    } else {
      checkProfile();
    }

    updateDevPanel();
  } catch (err) {
    console.error(err);
    els.statusLabel.textContent = "Error";
    els.messageTitle.textContent = "Gagal memuat game";
    els.messageFullText.textContent = err.message;
  }
}

function applyTodayDataToUI() {
  els.messageTitle.textContent = `Pesan Harian HSSE`;
  els.messageCategory.textContent = state.todayData.category || "-";
  const fullText = state.todayData.fullMessage || state.todayData.message || "Pesan belum tersedia.";
  els.messageFullText.textContent = fullText;
  const hint = state.todayData.hint || "Tebak kata kunci dari pesan hari ini";
  els.gameHint.textContent = `Hint: ${hint}`;
  els.wordLengthBadge.textContent = `${state.answer.length} huruf`;
  els.statusLabel.textContent = state.locked ? "Terkunci" : "Siap";
}

function handleMessageScroll() {
  const el = els.messageScrollBox;
  const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;

  if (isAtBottom) {
    els.confirmRead.disabled = false;
    els.readerHint.textContent = "Konfirmasi baca sudah aktif. Centang lalu mulai game.";
  } else {
    els.confirmRead.disabled = true;
    els.confirmRead.checked = false;
    els.readerHint.textContent = "Scroll sampai bawah untuk mengaktifkan konfirmasi baca.";
  }

  updateStartButtonState();
}

function updateStartButtonState() {
  els.startGameBtn.disabled = !(els.confirmRead.checked && !els.confirmRead.disabled);
}

function startGame() {
  state.hasReadMessage = true;
  els.readerSection.classList.add("hidden");
  els.gameSection.classList.remove("hidden");
  syncGameState();

  els.statusLabel.textContent = state.locked ? "Terkunci" : "Main";
  setFeedback("Mulai tebak kata kunci hari ini.", false);
}

function createBoard() {
  els.board.innerHTML = "";
  for (let rowIndex = 0; rowIndex < state.maxAttempts; rowIndex += 1) {
    const row = document.createElement("div");
    row.className = "board-row";
    row.dataset.row = String(rowIndex);
    row.style.gridTemplateColumns = `repeat(${state.answer.length}, minmax(0, 1fr))`;
    for (let colIndex = 0; colIndex < state.answer.length; colIndex += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = String(rowIndex);
      tile.dataset.col = String(colIndex);
      row.appendChild(tile);
    }

    els.board.appendChild(row);
  }
}

function createKeyboard() {
  const layouts = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
  ];

  els.keyboard.innerHTML = "";
  layouts.forEach((layout) => {
    const row = document.createElement("div");
    row.className = "keyboard-row";
    layout.forEach((keyValue) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "key";
      btn.textContent = keyValue;
      btn.dataset.key = keyValue;
      if (keyValue === "ENTER" || keyValue === "⌫") {
        btn.classList.add("wide");
      }

      btn.addEventListener("click", () => handleVirtualKey(keyValue));
      row.appendChild(btn);
    });

    els.keyboard.appendChild(row);
  });
}

function handleVirtualKey(keyValue) {
  if (state.locked || !state.hasReadMessage || state.popupOpen) return;
  if (keyValue === "ENTER") {
    submitGuess();
    return;
  }

  if (keyValue === "⌫") {
    removeLastChar();
    return;
  }

  if (state.current.length >= state.answer.length) return;
  state.current += keyValue;
  renderCurrentRow();
}

function handleInputChange(event) {
  if (state.locked || !state.hasReadMessage) return;
  state.current = normalizeWord(event.target.value).slice(0, state.answer.length);
  event.target.value = state.current;
  renderCurrentRow();
}

function renderAttempts() {
  state.attempts.forEach((attempt, index) => {
    paintRow(index, attempt.word, attempt.evaluation);
  });

  colorKeyboard();
  if (!state.locked) {
    renderCurrentRow();
  }
}

function renderCurrentRow() {
  const row = getRow(state.attempts.length);
  if (!row) return;

  [...row.children].forEach((tile, index) => {
    const char = state.current[index] || "";
    tile.textContent = char;
    tile.className = "tile";
    if (char) tile.classList.add("filled", "pop");
  });
}

function removeLastChar() {
  if (state.locked || !state.hasReadMessage) return;
  state.current = state.current.slice(0, -1);
  renderCurrentRow();
}

function submitGuess() {
  if (state.locked) {
    showToast("Puzzle hari ini sudah terkunci.");
    return;
  }

  if (!state.hasReadMessage) {
    showToast("Baca pesan keselamatan terlebih dahulu.");
    return;
  }

  const guess = normalizeWord(state.current);

  if (guess.length !== state.answer.length) {
    setFeedback(`Jumlah huruf harus ${state.answer.length}.`, true);
    return;
  }

  if (!state.validGuessSet.has(guess)) {
    setFeedback("Kata tidak ada dalam daftar tebakan valid. Coba kata lain.", true);
    showToast("Kata tidak valid.");

    state.current = "";
    renderCurrentRow();

    return;
  }

  const evaluation = evaluateGuess(guess, state.answer);
  const attempt = { word: guess, evaluation };
  state.attempts.push(attempt);
  updateDevPanel();
  paintRow(state.attempts.length - 1, guess, evaluation);
  colorKeyboard();
  state.current = "";
  persistPlayingState();
  if (guess === state.answer) {
    finishGame(true);
    return;
  }

  if (state.attempts.length >= state.maxAttempts) {
    finishGame(false);
    return;
  }

  setFeedback("Belum tepat, gunakan petunjuk warna untuk tebakan berikutnya.", false);
}

function evaluateGuess(guess, answer) {
  const result = Array(answer.length).fill("absent");
  const used = Array(answer.length).fill(false);
  for (let i = 0; i < guess.length; i += 1) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    if (result[i] === "correct") continue;
    for (let j = 0; j < answer.length; j += 1) {
      if (!used[j] && guess[i] === answer[j]) {
        result[i] = "present";
        used[j] = true;
        break;
      }
    }
  }

  return result;
}

function paintRow(rowIndex, word, evaluation) {
  const row = getRow(rowIndex);
  if (!row) return;
  [...row.children].forEach((tile, index) => {
    tile.textContent = word[index] || "";
    tile.className = "tile";
    if (word[index]) tile.classList.add("filled");
    if (evaluation[index]) tile.classList.add(evaluation[index]);
  });
}

function colorKeyboard() {
  const priority = { absent: 1, present: 2, correct: 3 };
  const bestByLetter = {};
  state.attempts.forEach((attempt) => {
    attempt.word.split("").forEach((char, index) => {
      const score = attempt.evaluation[index];
      const current = bestByLetter[char];
      if (!current || priority[score] > priority[current]) {
        bestByLetter[char] = score;
      }
    });
  });

  document.querySelectorAll(".key").forEach((btn) => {
    const key = btn.dataset.key || "";
    if (key.length !== 1) return;

    btn.classList.remove("correct", "present", "absent");
    if (bestByLetter[key]) {
      btn.classList.add(bestByLetter[key]);
    }
  });
}

function finishGame(isWin) {
  state.locked = true;
  state.result = isWin ? "win" : "lose";
  const storage = readStorage();
  ensureTodayStorage(storage);
  storage.daily[state.todayKey] = {
    date: state.todayKey,
    result: state.result,
    locked: true,
    attempts: state.attempts,
    hasShared: state.hasSharedToday,
    hasReadMessage: true,
  };

  storage.stats = updateStats(storage.stats, state.todayKey, isWin);
  saveStorage(storage);

  saveResultToFirebase();

  updateStatsUI();
  syncGameState();

  if (isWin) {
    setFeedback(`Benar! Kata kuncinya: ${state.answer}`, false);
    showToast("Jawaban benar.");

    state.popupQueue.push({
      eyebrow: "Edukasi Hari Ini",
      title: `Jawaban: ${state.todayData.word}`,
      body: `
        <p><strong>Makna:</strong><br>${escapeHtml(state.todayData.meaning || "-")}</p>
        <p><strong>Edukasi K3:</strong><br>${escapeHtml(state.todayData.k3Education || "-")}</p>
        <p><strong>Pesan Keselamatan Harian:</strong><br>${escapeHtml(state.todayData.dailySafetyMessage || state.todayData.message || "-")}</p>
      `,
      actions: [{ label: "Lanjut", variant: "primary", onClick: closeModalAndContinue }],
    });
  } else {
    setFeedback(`Kesempatan habis. Jawaban hari ini: ${state.answer}`, true);
    showToast("Kesempatan habis.");
  }

  state.popupQueue.push({
    eyebrow: "Hasil Hari Ini",
    title: isWin ? "Selamat, jawaban benar!" : "Game selesai",
    body: `
      <p style="margin-bottom: 8px;">${isWin ? "Pesan harian sudah kamu baca dan kata kuncinya berhasil ditebak." : "Pesan harian sudah dibaca, tapi kata kunci belum berhasil ditebak."}</p>
      <p style="margin-bottom: 8px;"><strong>Status:</strong> ${isWin ? "Selesai / Menang" : "Selesai / Belum berhasil"}</p>
      <p style="margin-bottom: 12px;"><strong>Daily lock aktif</strong> sampai hari berikutnya.</p>
      
      <div style="font-size: 0.8rem; font-weight: 700; color: var(--muted); margin-bottom: 4px;">PREVIEW SHARE:</div>
      <div class="share-preview-box">${escapeHtml(buildShareText())}</div>
    `,
    actions: [
      { label: "Bagikan", variant: "secondary", onClick: () => shareResult(true) },
      { label: "Tutup", variant: "primary", onClick: closeModalAndContinue },
    ],
  });

  updateDevPanel();
  processPopupQueue();
}

function queueStartupHelp() {
  state.popupQueue.push({
    eyebrow: "Panduan",
    title: "Cara main KATGA",
    body: `
      <p><strong>Langkah 1:</strong> baca Pesan Keselamatan Harian sampai selesai.</p>
      <p><strong>Langkah 2:</strong> centang konfirmasi baca, lalu mulai game.</p>
      <p><strong>Langkah 3:</strong> tebak 1 kata kunci penting dari pesan menggunakan format Wordle.</p>
      <p><strong>Warna petunjuk:</strong></p>
      <p>🟩 Huruf benar & posisi benar<br>🟨 Huruf ada tapi posisi salah<br>⬛ Huruf tidak ada</p>
    `,
    actions: [{ label: "Mengerti", variant: "primary", onClick: closeModalAndContinue }],
  });
}

function showEducationPopup(closeLabel = "Tutup") {
  const gameFinished = state.locked && (state.result === "win" || state.result === "lose");

  showModal({
    eyebrow: "Edukasi Hari Ini",
    title: gameFinished ? `Jawaban: ${state.todayData.word}` : "Jawaban : Belum tersedia. Selesaikan permainan terlebih dahulu 😊",
    body: `
      <p><strong>Makna:</strong><br>${escapeHtml(state.todayData.meaning || "-")}</p>
      <p><strong>Edukasi K3:</strong><br>${escapeHtml(state.todayData.k3Education || "-")}</p>
      <p><strong>Pesan Keselamatan Harian:</strong><br>${escapeHtml(state.todayData.dailySafetyMessage || state.todayData.message || "-")}</p>
    `,
    actions: [{ label: closeLabel, variant: "primary", onClick: closeModalAndContinue }],
    skipQueue: true,
  });
}

function openHelpModal() {
  showModal({
    eyebrow: "Bantuan",
    title: "Tentang KATGA Beta",
    body: `
      <p>KATGA adalah media belajar HSSE sederhana berbasis game kata.</p>
      <p>Tujuannya memastikan pesan keselamatan harian dibaca, lalu diperkuat dengan 1 kata kunci penting.</p>
    `,
    actions: [{ label: "Tutup", variant: "primary", onClick: closeModalAndContinue }],
    skipQueue: true,
  });
}

function openGuideModal() {
  showModal({
    eyebrow: "Panduan",
    title: "Cara main KATGA",
    body: `
      <p><strong>Langkah 1:</strong> baca Pesan Keselamatan Harian sampai selesai.</p>
      <p><strong>Langkah 2:</strong> centang konfirmasi baca, lalu mulai game.</p>
      <p><strong>Langkah 3:</strong> tebak 1 kata kunci penting dari pesan menggunakan format Wordle.</p>
      <p><strong>Warna petunjuk:</strong></p>
      <p>🟩 Huruf benar & posisi benar<br>🟨 Huruf ada tapi posisi salah<br>⬛ Huruf tidak ada</p>
    `,
    actions: [{ label: "Mengerti", variant: "primary", onClick: closeModalAndContinue }],
    skipQueue: true,
  });
}

function processPopupQueue() {
  if (state.popupOpen || state.popupQueue.length === 0) return;
  const next = state.popupQueue.shift();
  showModal(next);
}

function showModal({ eyebrow, title, body, actions = [], skipQueue = false }) {
  if (state.popupOpen && !skipQueue) return;

  state.popupOpen = true;
  els.modalEyebrow.textContent = eyebrow || "Info";
  els.modalTitle.textContent = title || "Informasi";
  els.modalBody.innerHTML = body || "";
  els.modalActions.innerHTML = "";

  if (!actions.length) {
    actions = [{ label: "Tutup", variant: "primary", onClick: closeModalAndContinue }];
  }

  actions.forEach((action) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `modal-btn ${action.variant === "secondary" ? "secondary" : "primary"}`;
    btn.textContent = action.label;
    btn.addEventListener("click", action.onClick);
    els.modalActions.appendChild(btn);
  });
  els.modalOverlay.classList.remove("hidden");
  els.modalOverlay.setAttribute("aria-hidden", "false");
}

function closeModalAndContinue() {
  state.popupOpen = false;
  els.modalOverlay.classList.add("hidden");
  els.modalOverlay.setAttribute("aria-hidden", "true");
  processPopupQueue();
}

async function shareResult(fromPopup) {
  if (!state.attempts.length) {
    showToast("Belum ada hasil untuk dibagikan.");
    return;
  }

  const text = buildShareText();

  try {
    if (navigator.share) {
      await navigator.share({
        title: "KATGA",
        text,
      });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      showToast("Hasil disalin.");
    } else {
      fallbackCopy(text);
      showToast("Hasil disalin.");
    }
  } catch (error) {
    console.error(error);
  }
}

function buildShareText() {
  const score = state.result === "win" ? state.attempts.length : state.locked ? "X" : state.attempts.length;

  const lines = state.attempts.map((attempt) => attempt.evaluation.map(toEmoji).join(""));

  return ["📢 " + state.todayData.fullMessage || "", "", "🌐 Mainkan KATGA:", "https://katga-beta1.vercel.app/", `📅 ${state.todayKey}`, `🏆 Hasil: ${score}/${state.maxAttempts}`, ...lines, "🎯 KATGA - Kata Harian HSSE"].join("\n");
}

function toEmoji(status) {
  if (status === "correct") return "🟩";
  if (status === "present") return "🟨";
  return "⬛";
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "readonly");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

function restoreProgress() {
  const storage = readStorage();
  ensureTodayStorage(storage);
  const todayState = storage.daily[state.todayKey];
  state.attempts = Array.isArray(todayState.attempts) ? todayState.attempts : [];
  state.locked = Boolean(todayState.locked);
  state.result = todayState.result || "playing";
  state.hasSharedToday = Boolean(todayState.hasShared);
  state.hasReadMessage = Boolean(todayState.hasReadMessage);

  if (state.hasReadMessage) {
    els.readerSection.classList.add("hidden");
    els.gameSection.classList.remove("hidden");
  }
}

function persistPlayingState() {
  const storage = readStorage();
  ensureTodayStorage(storage);

  storage.daily[state.todayKey] = {
    date: state.todayKey,
    result: "playing",
    locked: false,
    attempts: state.attempts,
    hasShared: state.hasSharedToday,
    hasReadMessage: true,
  };

  saveStorage(storage);
}

function syncGameState() {
  if (state.locked) {
    els.statusLabel.textContent = state.result === "win" ? "Menang" : "Selesai";
  } else if (state.hasReadMessage) {
    els.statusLabel.textContent = "Main";
  } else {
    els.statusLabel.textContent = "Baca Dulu";
  }
}

function updateStatsUI() {
  const storage = readStorage();
  const stats = storage.stats || defaultStats();
  els.streakCount.textContent = String(stats.streak || 0);
  els.bestCount.textContent = String(stats.best || 0);
}

function updateStatsUIFrom(stats) {
  els.streakCount.textContent = String(stats.streak || 0);
  els.bestCount.textContent = String(stats.best || 0);
}

function updateStats(stats = defaultStats(), dateKey, isWin) {
  const next = {
    streak: Number(stats.streak || 0),
    best: Number(stats.best || 0),
    lastWinDate: stats.lastWinDate || null,
  };

  if (!isWin) {
    next.streak = 0;
    return next;
  }

  if (next.lastWinDate === dateKey) {
    return next;
  }

  const yesterday = subtractDays(dateKey, 1);
  if (next.lastWinDate === yesterday) {
    next.streak += 1;
  } else {
    next.streak = 1;
  }

  next.lastWinDate = dateKey;
  next.best = Math.max(next.best, next.streak);
  updateStatsUIFrom(next);
  return next;
}

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStorage();
    const parsed = JSON.parse(raw);
    return {
      stats: { ...defaultStats(), ...(parsed.stats || {}) },
      daily: typeof parsed.daily === "object" && parsed.daily ? parsed.daily : {},
    };
  } catch {
    return defaultStorage();
  }
}

function saveStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function defaultStorage() {
  return {
    stats: defaultStats(),
    daily: {},
  };
}

function defaultStats() {
  return {
    streak: 0,
    best: 0,
    lastWinDate: null,
  };
}

function ensureTodayStorage(storage) {
  if (!storage.daily[state.todayKey]) {
    storage.daily[state.todayKey] = {
      date: state.todayKey,
      result: "playing",
      locked: false,
      attempts: [],
      hasShared: false,
      hasReadMessage: false,
    };
    saveStorage(storage);
  }
}

function getRow(index) {
  return els.board.querySelector(`.board-row[data-row="${index}"]`);
}

function setFeedback(message, isError) {
  els.feedback.textContent = message;
  els.feedback.style.color = isError ? "#d9534f" : "#5f738d";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeWord(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");
}

function subtractDays(dateKey, days) {
  const dt = new Date(`${dateKey}T00:00:00`);
  dt.setDate(dt.getDate() - days);
  return formatDate(dt);
}

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPlayerName() {
  return localStorage.getItem("katga_name") || "Anonim";
}

function getPlayerUnit() {
  return localStorage.getItem("katga_unit") || "Tidak Diketahui";
}

function hasProfile() {
  return Boolean(localStorage.getItem("katga_name") && localStorage.getItem("katga_unit"));
}

function checkProfile() {
  const modal = document.getElementById("profileModal");
  const nameInput = document.getElementById("profileName");
  const unitSelect = document.getElementById("profileUnit");
  const saveBtn = document.getElementById("saveProfileBtn");

  modal.classList.remove("hidden");

  if (hasProfile()) {
    // Existing player
    nameInput.value = "";
    unitSelect.value = "";

    nameInput.readOnly = false;
    unitSelect.disabled = false;
  }
  saveBtn.textContent = "Mulai Bermain";
}

function saveProfile() {
  const modal = document.getElementById("profileModal");

  const name = document.getElementById("profileName").value.trim();
  const unit = document.getElementById("profileUnit").value;

  // Nama dan unit tetap wajib diisi setiap mulai permainan
  if (!name || !unit) {
    alert("Lengkapi profil terlebih dahulu");
    return;
  }

  // Existing player → input hanya untuk masuk,
  // tidak mengubah identitas yang sudah tersimpan
  if (hasProfile()) {
    getPlayerId();

    modal.classList.add("hidden");
    updateDevPanel();

    if (state.returnFromDashboard && state.locked && (state.result === "win" || state.result === "lose")) {
      state.returnFromDashboard = false;
      showEducationPopup("Tutup");
      return;
    }

    queueStartupHelp();
    processPopupQueue();
    return;
  }

  // New player → simpan sebagai identitas pertama
  localStorage.setItem("katga_name", name);
  localStorage.setItem("katga_unit", unit);

  // Buat ID sekali dan pertahankan
  getPlayerId();

  modal.classList.add("hidden");
  updateDevPanel();

  queueStartupHelp();
  processPopupQueue();
}

function getPlayerId() {
  let playerId = localStorage.getItem("katga_player_id");

  if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem("katga_player_id", playerId);
  }

  return playerId;
}

async function saveResultToFirebase() {
  if (!window.db || !window.addDoc || !window.collection) {
    return;
  }

  try {
    const playerName = getPlayerName();
    await window.addDoc(window.collection(window.db, "results"), {
      playerId: getPlayerId(),
      name: playerName,
      unit: getPlayerUnit(),
      date: state.todayKey,
      result: state.result,
      attempts: state.attempts.length,
      answer: state.answer,
      wordLength: state.answer.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("FIREBASE ERROR:", error);
    alert(error?.message || String(error));
  }
}

/* ==========================================
   KATGA DEV PANEL & ACTIONS
   ========================================== */

function updateDevPanel() {
  if (!DEV_MODE) return;

  const panel = document.getElementById("devPanel");
  if (!panel) return;

  panel.classList.remove("hidden");

  panel.innerHTML = `
      <div class="dev-header" onclick="toggleDevPanel()">
        <strong>KATGA DEV</strong>
        <span id="devIcon">${panel.classList.contains("minimized") ? "▲" : "▼"}</span>
      </div>
  
      <hr>
  
      Date: ${state.todayKey} <br>
      Answer: ${state.answer} <br>
      Result: ${state.result} <br>
      Attempts: ${state.attempts.length} <br>
      Firebase: ${window.db ? "✅" : "❌"} <br>
      Player: ${getPlayerName() || "-"} <br>
      Unit: ${getPlayerUnit() || "-"} <br>
      Word Length: ${state.answer.length} <br>
      Read Message: ${state.hasReadMessage ? "✅" : "❌"} <br>
  
      <button onclick="revealAnswer()">Show Answer</button>
      <button onclick="forceWin()">Force Win</button>
      <button onclick="forceLose()">Force Lose</button>
      <button onclick="resetToday()">Reset Puzzle</button>
      <button onclick="testFirebase()">Test Firebase</button>
      <button onclick="clearName()">Clear Name</button>
      <button onclick="clearUnit()">Clear Unit</button>
      <button onclick="forceRead()">Force Read</button>
    `;
}

window.toggleDevPanel = function () {
  const panel = document.getElementById("devPanel");
  if (!panel) return;

  panel.classList.toggle("minimized");

  const icon = document.getElementById("devIcon");
  if (icon) {
    icon.textContent = panel.classList.contains("minimized") ? "▲" : "▼";
  }
};

window.revealAnswer = function () {
  alert(state.answer);
};

window.resetToday = function () {
  const storage = readStorage();

  // Hapus progress lokal hari ini
  delete storage.daily[state.todayKey];
  saveStorage(storage);

  // Izinkan Dev Mode melewati Firebase daily lock sekali
  sessionStorage.setItem("katga_dev_bypass_daily_lock", "true");

  location.reload();
};

window.testFirebase = async function () {
  const result = await checkTodayResultFromFirebase();

  if (!result) {
    alert("❌ Belum ada hasil game hari ini di Firebase");
    return;
  }

  alert(`✅ Hasil hari ini ditemukan\n\n` + `Player: ${result.name}\n` + `Unit: ${result.unit}\n` + `Result: ${result.result}\n` + `Attempts: ${result.attempts}\n` + `Date: ${result.date}`);
};

window.clearName = function () {
  localStorage.removeItem("katga_name");
  alert("Nama dihapus");
};

window.clearUnit = function () {
  localStorage.removeItem("katga_unit");
  alert("Unit dihapus");
  updateDevPanel();
};

window.forceWin = function () {
  state.current = state.answer;
  renderCurrentRow();
  submitGuess();
};

window.forceLose = function () {
  state.locked = false;
  finishGame(false);
};

window.forceRead = function () {
  state.hasReadMessage = true;
  els.readerSection.classList.add("hidden");
  els.gameSection.classList.remove("hidden");
  syncGameState();
  updateDevPanel();
};

/* ==========================================
   GENERATE & PREVIEW QUOTE CARD (2-LEVEL MODE)
   ========================================== */

let generatedImageBlob = null;

async function generateAndPreviewQuoteCard() {
  if (!state.attempts || !state.attempts.length) {
    showToast("Belum ada hasil untuk dibagikan.");
    return;
  }

  showToast("Menyiapkan preview...");

  // 1. Fill Badge Skor
  const scoreText = state.result === "win" ? `${state.attempts.length}/${state.maxAttempts}` : "X";
  const qcScoreBadge = document.getElementById("qcScoreBadge");
  if (qcScoreBadge) qcScoreBadge.textContent = `HASIL: ${scoreText}`;

  // 2. Fill Data 2-Level (k3Education + dailySafetyMessage)
  const qcK3Text = document.getElementById("qcK3Text");
  if (qcK3Text) qcK3Text.textContent = state.todayData.k3Education || "-";

  const qcSafetyText = document.getElementById("qcSafetyText");
  if (qcSafetyText) qcSafetyText.textContent = state.todayData.dailySafetyMessage || state.todayData.message || "-";

  // 3. Fill Info Pemain & Tanggal
  const qcPlayerName = document.getElementById("qcPlayerName");
  if (qcPlayerName) qcPlayerName.textContent = getPlayerName();

  const qcPlayerUnit = document.getElementById("qcPlayerUnit");
  if (qcPlayerUnit) qcPlayerUnit.textContent = getPlayerUnit();

  const qcDate = document.getElementById("qcDate");
  if (qcDate) qcDate.textContent = state.todayKey;

  // 4. Fill Tile Emojis
  const qcTiles = document.getElementById("qcTiles");
  if (qcTiles) {
    const tileLines = state.attempts.map((att) => att.evaluation.map(toEmoji).join("")).join("<br>");
    qcTiles.innerHTML = tileLines;
  }

  // 5. Render Template HTML ke Gambar Canvas
  const templateEl = document.getElementById("quoteCardTemplate");
  const previewImg = document.getElementById("sharePreviewImg");
  const previewModal = document.getElementById("sharePreviewModal");

  if (!templateEl || !previewImg || !previewModal) {
    showToast("Elemen preview tidak ditemukan.");
    return;
  }

  try {
    const canvas = await html2canvas(templateEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
    });

    // Mengisi gambar ke tag img modal secara langsung via Data URL
    const imageUrl = canvas.toDataURL("image/png");
    previewImg.src = imageUrl;

    // Menyimpan blob data untuk tombol Download/Share
    canvas.toBlob((blob) => {
      generatedImageBlob = blob;
    }, "image/png");

    // Menampilkan Modal Preview Result
    previewModal.classList.remove("hidden");
  } catch (err) {
    console.error("Gagal membuat quote card:", err);
    showToast("Gagal memuat preview.");
  }
}

// Handler Khusus Modal Preview & Action Buttons
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("downloadImgBtn")?.addEventListener("click", () => {
    const previewImg = document.getElementById("sharePreviewImg");
    if (!previewImg || !previewImg.src) return;

    const link = document.createElement("a");
    link.download = `KATGA-${state.todayKey}.png`;
    link.href = previewImg.src;
    link.click();
    showToast("Gambar berhasil diunduh!");
  });

  document.getElementById("confirmShareBtn")?.addEventListener("click", async () => {
    if (!generatedImageBlob) return;
    const file = new File([generatedImageBlob], `KATGA-${state.todayKey}.png`, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Hasil KATGA Harian",
          text: `Edukasi K3 KATGA Hari Ini - ${state.todayKey}`,
        });
      } catch (err) {
        console.warn("Share dibatalkan:", err);
      }
    } else {
      showToast("Browser tidak mendukung share file, gunakan tombol Download.");
    }
  });

  document.getElementById("closePreviewBtn")?.addEventListener("click", () => {
    document.getElementById("sharePreviewModal")?.classList.add("hidden");
  });
});
