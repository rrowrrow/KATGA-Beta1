const STORAGE_KEY = "katga_beta_v1";
const DATA_URL = "./data/daily-k3.json";

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
  hasReadMessage: false
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
  els.guessInput = document.getElementById("guessInput");
  els.backspaceBtn = document.getElementById("backspaceBtn");
  els.submitBtn = document.getElementById("submitBtn");
  els.keyboard = document.getElementById("keyboard");

  els.helpBtn = document.getElementById("helpBtn");
  els.shareBtn = document.getElementById("shareBtn");

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

  els.guessInput.addEventListener("input", handleInputChange);
  els.guessInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitGuess();
    }
  });

  els.backspaceBtn.addEventListener("click", removeLastChar);
  els.submitBtn.addEventListener("click", submitGuess);

  els.helpBtn.addEventListener("click", openHelpModal);
  els.shareBtn.addEventListener("click", () => shareResult(false));

  els.modalCloseBtn.addEventListener("click", closeModalAndContinue);
  els.modalOverlay.addEventListener("click", (event) => {
    if (event.target === els.modalOverlay) {
      closeModalAndContinue();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (state.popupOpen) return;
    if (state.locked) return;
    if (!state.hasReadMessage) return;

    if (event.key === "Backspace" && document.activeElement !== els.guessInput) {
      removeLastChar();
      return;
    }

    if (event.key === "Enter" && document.activeElement !== els.guessInput) {
      submitGuess();
      return;
    }

    if (/^[a-zA-Z]$/.test(event.key) && document.activeElement !== els.guessInput) {
      if (state.current.length >= state.answer.length) return;
      state.current += event.key.toUpperCase();
      els.guessInput.value = state.current;
      renderCurrentRow();
    }
  });
}

async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`File ${DATA_URL} tidak bisa dibuka`);
    }

    const data = await res.json();
    state.config = data;
    state.maxAttempts = Number.isInteger(data.maxGuesses) ? data.maxGuesses : 6;

    const today = new Date();
    state.todayKey = formatDate(today);
    els.dateLabel.textContent = today.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    state.todayData = getTodayWord(data, state.todayKey, today);
    if (!state.todayData || !state.todayData.word) {
      throw new Error("Kata harian tidak ditemukan di data.json");
    }

    state.answer = normalizeWord(state.todayData.word);
    if (!state.answer) {
      throw new Error("Word harian tidak valid");
    }

    const validByLen = data.validGuessesByLength || {};
    const validList = validByLen[String(state.answer.length)] || [];
    state.validGuessSet = new Set(validList.map(normalizeWord).filter(Boolean));
    state.validGuessSet.add(state.answer);

    applyTodayDataToUI();
    restoreProgress();
    createBoard();
    createKeyboard();
    renderAttempts();
    syncGameState();
    updateStatsUI();

    queueStartupHelp();
    processPopupQueue();
  } catch (err) {
    console.error(err);
    els.statusLabel.textContent = "Error";
    els.messageTitle.textContent = "Gagal memuat game";
    els.messageFullText.textContent = err.message;
  }
}

function getTodayWord(config, todayKey, todayDate) {
  if (Array.isArray(config.manualWords)) {
    const exact = config.manualWords.find((item) => item.date === todayKey);
    if (exact) return exact;
  }

  if (Array.isArray(config.fallbackWords) && config.fallbackWords.length > 0) {
    const index = dayOfYear(todayDate) % config.fallbackWords.length;
    return config.fallbackWords[index];
  }

  return null;
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
  els.statusLabel.textContent = state.locked ? "Terkunci" : "Main";
  els.guessInput.focus();
  setFeedback("Mulai tebak kata kunci hari ini.", false);

  const stored = readStorage();
  ensureTodayStorage(stored);
  stored.daily[state.todayKey].hasReadMessage = true;
  saveStorage(stored);
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
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"]
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
  els.guessInput.value = state.current;
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
  els.guessInput.value = state.current;
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
    setFeedback("Kata tidak ada dalam daftar tebakan valid.", true);
    showToast("Kata tidak valid.");
    return;
  }

  const evaluation = evaluateGuess(guess, state.answer);
  const attempt = { word: guess, evaluation };
  state.attempts.push(attempt);

  paintRow(state.attempts.length - 1, guess, evaluation);
  colorKeyboard();

  state.current = "";
  els.guessInput.value = "";

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
    hasReadMessage: true
  };

  storage.stats = updateStats(storage.stats, state.todayKey, isWin);
  saveStorage(storage);

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
      actions: [
        { label: "Lanjut", variant: "primary", onClick: closeModalAndContinue }
      ]
    });
  } else {
    setFeedback(`Kesempatan habis. Jawaban hari ini: ${state.answer}`, true);
    showToast("Kesempatan habis.");
  }

  state.popupQueue.push({
    eyebrow: "Hasil Hari Ini",
    title: isWin ? "Selamat, jawaban benar!" : "Game selesai",
    body: `
      <p>${isWin ? "Pesan harian sudah kamu baca dan kata kuncinya berhasil ditebak." : "Pesan harian sudah dibaca, tapi kata kunci belum berhasil ditebak."}</p>
      <p><strong>Status:</strong> ${isWin ? "Selesai / Menang" : "Selesai / Belum berhasil"}</p>
      <p><strong>Daily lock aktif</strong> sampai hari berikutnya.</p>
      <p><strong>Preview share:</strong></p>
      <pre>${escapeHtml(buildShareText())}</pre>
    `,
    actions: [
      { label: "Copy hasil", variant: "secondary", onClick: () => shareResult(true) },
      { label: "Tutup", variant: "primary", onClick: closeModalAndContinue }
    ]
  });

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
    actions: [
      { label: "Mengerti", variant: "primary", onClick: closeModalAndContinue }
    ]
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
    actions: [
      { label: "Tutup", variant: "primary", onClick: closeModalAndContinue }
    ],
    skipQueue: true
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

function shareResult(fromPopup) {
  if (!state.attempts.length) {
    showToast("Belum ada hasil untuk dibagikan.");
    return;
  }

  const text = buildShareText();

  const completeShare = async () => {
    try {
      if (navigator.share && !fromPopup) {
        await navigator.share({
          title: "KATGA",
          text
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }

      state.hasSharedToday = true;
      const storage = readStorage();
      ensureTodayStorage(storage);
      storage.daily[state.todayKey].hasShared = true;
      saveStorage(storage);
      showToast("Hasil berhasil dibagikan / disalin.");
    } catch (err) {
      console.error(err);
      showToast("Gagal membagikan hasil.");
    }
  };

  completeShare();
}

function buildShareText() {
  const score = state.result === "win" ? state.attempts.length : state.locked ? "X" : state.attempts.length;
  const lines = state.attempts.map((attempt) =>
    attempt.evaluation.map(toEmoji).join("")
  );

  return [
    `KATGA | ${state.todayKey}`,
    `${score}/${state.maxAttempts}`,
    ...lines
  ].join("\n");
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
    hasReadMessage: true
  };

  saveStorage(storage);
}

function syncGameState() {
  els.guessInput.disabled = state.locked || !state.hasReadMessage;
  els.submitBtn.disabled = state.locked || !state.hasReadMessage;
  els.backspaceBtn.disabled = state.locked || !state.hasReadMessage;

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
    lastWinDate: stats.lastWinDate || null
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
      daily: typeof parsed.daily === "object" && parsed.daily ? parsed.daily : {}
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
    daily: {}
  };
}

function defaultStats() {
  return {
    streak: 0,
    best: 0,
    lastWinDate: null
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
      hasReadMessage: false
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
