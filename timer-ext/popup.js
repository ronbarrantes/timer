// ── Constants ─────────────────────────────────────────────────────────────────

const TIMER_KEY    = "qa-timer-state-v1";
const SETTINGS_KEY = "qa-timer-settings-v1";
const ALARM_NAME   = "timer-done";
const VALID_DESIGNS = ["default", "walmart", "glass", "neon"];

// Phase thresholds: whichever is smaller of (% of total) or (hard cap) wins.
// Keeps long timers from spending 6 mins blinking red.
const PHASES = [
  { pct: 0.05, capMs:  45_000, cls: "phase-panic"   }, // ≤ 5%  or 45 sec
  { pct: 0.10, capMs:  90_000, cls: "phase-danger"  }, // ≤ 10% or 90 sec
  { pct: 0.25, capMs: 180_000, cls: "phase-warning" }, // ≤ 25% or  3 min
  { pct: 0.50, capMs: 300_000, cls: "phase-caution" }, // ≤ 50% or  5 min
];

const DEFAULT_TIMER = {
  status: "idle",      // "idle" | "running" | "paused" | "done"
  endTime: null,       // unix ms when timer hits zero (only while running)
  remainingMs: 5 * 60 * 1000,
  totalMs:     5 * 60 * 1000,
};

const DEFAULT_SETTINGS = {
  themeMode: "system",
  design: "default",
};

// ── Storage ───────────────────────────────────────────────────────────────────

const store = (() => {
  const ext = typeof chrome !== "undefined" && !!chrome.storage?.local;
  return {
    async get(key) {
      if (ext) {
        const r = await chrome.storage.local.get(key);
        return r?.[key] ?? null;
      }
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    async set(key, val) {
      if (ext) {
        await chrome.storage.local.set({ [key]: val });
      } else {
        localStorage.setItem(key, JSON.stringify(val));
      }
    },
  };
})();

// ── Alarms ────────────────────────────────────────────────────────────────────

const alarms = (() => {
  const ext = typeof chrome !== "undefined" && !!chrome.alarms;
  return {
    set(when)  { if (ext) chrome.alarms.create(ALARM_NAME, { when }); },
    clear()    { if (ext) chrome.alarms.clear(ALARM_NAME); },
  };
})();

// ── State ─────────────────────────────────────────────────────────────────────

let state           = { ...DEFAULT_TIMER };
let settings        = { ...DEFAULT_SETTINGS };
let pendingSettings = { ...DEFAULT_SETTINGS };
let tickId          = null;
let themeMediaQuery = null;

// ── DOM ───────────────────────────────────────────────────────────────────────

const timerDisplay   = document.getElementById("timer-display");
const timerWrap      = document.getElementById("timer-wrap");
const timerLabel     = document.getElementById("timer-label");
const startBtn       = document.getElementById("start-btn");
const continueBtn    = document.getElementById("continue-btn");
const resetBtn       = document.getElementById("reset-btn");
const doneResetBtn   = document.getElementById("done-reset-btn");
const presetBtns     = document.querySelectorAll(".preset-btn");
const customMinsInput = document.getElementById("custom-mins");
const setCustomBtn   = document.getElementById("set-custom-btn");
const openSettingsBtn  = document.getElementById("open-settings");
const closeSettingsBtn = document.getElementById("close-settings");
const settingsSaveBtn    = document.getElementById("settings-save");
const settingsDiscardBtn = document.getElementById("settings-discard");
const themeModeSelect = document.getElementById("theme-mode");
const designCards     = document.querySelectorAll(".design-card");
const settingsPanel   = document.getElementById("settings-panel");

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ms) {
  const totalSecs = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getRemainingMs() {
  if (state.status === "running") {
    return Math.max(0, state.endTime - Date.now());
  }
  return Math.max(0, state.remainingMs);
}

function getPhaseClass() {
  // Idle and non-running states get no phase coloring
  if (state.status !== "running") return "";
  const rem = getRemainingMs();
  for (const phase of PHASES) {
    const thresholdMs = Math.min(phase.pct * state.totalMs, phase.capMs);
    if (rem <= thresholdMs) return phase.cls;
  }
  // Running but no threshold hit — use accent (the "all good" running color)
  return "phase-running";
}

function buildTimerLabel() {
  const totalMins = state.totalMs / 60000;
  const label = Number.isInteger(totalMins)
    ? `${totalMins} min timer`
    : `${totalMins.toFixed(1)} min timer`;
  return label;
}

// ── Display ───────────────────────────────────────────────────────────────────

function updateDisplay() {
  const rem = getRemainingMs();
  timerDisplay.textContent = formatTime(rem);

  // Drive layout via body[data-state]
  document.body.dataset.state = state.status;

  // Phase coloring
  const phaseClass = getPhaseClass();
  timerDisplay.className = ["timer-display", phaseClass].filter(Boolean).join(" ");

  // Label shown when paused so you remember what you set
  timerLabel.textContent = state.status === "paused" ? buildTimerLabel() : "";

  // Preset highlight — based on totalMs regardless of status
  const activeMins = state.totalMs / 60000;
  presetBtns.forEach((btn) => {
    btn.classList.toggle("active", parseFloat(btn.dataset.mins) === activeMins);
  });
}

// ── Tick ──────────────────────────────────────────────────────────────────────

function startTick() {
  stopTick();
  tickId = setInterval(() => {
    if (state.status !== "running") { stopTick(); return; }
    if (getRemainingMs() <= 0) {
      handleDone();
    } else {
      updateDisplay();
    }
  }, 250);
}

function stopTick() {
  if (tickId !== null) { clearInterval(tickId); tickId = null; }
}

// ── Timer Actions ─────────────────────────────────────────────────────────────

async function handleStart() {
  if (state.remainingMs <= 0) return;
  state.endTime = Date.now() + state.remainingMs;
  state.status  = "running";
  alarms.set(state.endTime);
  startTick();
  await store.set(TIMER_KEY, state);
  updateDisplay();
}

async function handlePause() {
  state.remainingMs = getRemainingMs();
  state.endTime     = null;
  state.status      = "paused";
  alarms.clear();
  stopTick();
  await store.set(TIMER_KEY, state);
  updateDisplay();
}

async function handleContinue() {
  if (state.remainingMs <= 0) return;
  state.endTime = Date.now() + state.remainingMs;
  state.status  = "running";
  alarms.set(state.endTime);
  startTick();
  await store.set(TIMER_KEY, state);
  updateDisplay();
}

async function handleReset() {
  stopTick();
  alarms.clear();
  state.status      = "idle";
  state.endTime     = null;
  state.remainingMs = state.totalMs;
  await store.set(TIMER_KEY, state);
  updateDisplay();
}

async function handleDone() {
  stopTick();
  alarms.clear();
  state.status      = "done";
  state.remainingMs = 0;
  state.endTime     = null;
  await store.set(TIMER_KEY, state);
  updateDisplay();
}

async function loadPreset(mins) {
  stopTick();
  alarms.clear();
  const ms = Math.round(mins * 60 * 1000);
  state.status      = "idle";
  state.endTime     = null;
  state.totalMs     = ms;
  state.remainingMs = ms;
  await store.set(TIMER_KEY, state);
  updateDisplay();
}

async function handleSetCustom() {
  const val = parseFloat(customMinsInput.value);
  if (!val || val <= 0) return;
  await loadPreset(val);
  customMinsInput.value = "";
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(mode) {
  if (themeMediaQuery) {
    themeMediaQuery.removeEventListener("change", onSystemThemeChange);
    themeMediaQuery = null;
  }
  if (mode === "system") {
    themeMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    themeMediaQuery.addEventListener("change", onSystemThemeChange);
    setThemeAttr(themeMediaQuery.matches ? "light" : null);
  } else {
    setThemeAttr(mode === "light" ? "light" : null);
  }
}

function setThemeAttr(val) {
  if (val) document.documentElement.dataset.theme = val;
  else     delete document.documentElement.dataset.theme;
}

function onSystemThemeChange(e) {
  setThemeAttr(e.matches ? "light" : null);
}

function applyDesign(design) {
  document.documentElement.dataset.design = VALID_DESIGNS.includes(design) ? design : "default";
}

// ── Settings ──────────────────────────────────────────────────────────────────

function syncSettingsUI() {
  themeModeSelect.value = pendingSettings.themeMode;
  designCards.forEach((c) =>
    c.setAttribute("aria-pressed", String(c.dataset.design === pendingSettings.design))
  );
}

function openSettings() {
  pendingSettings = { ...settings };
  syncSettingsUI();
  settingsPanel.classList.remove("hidden");
}

function discardSettings() {
  applyTheme(settings.themeMode);
  applyDesign(settings.design);
  settingsPanel.classList.add("hidden");
}

async function saveSettings() {
  settings = { ...pendingSettings };
  await store.set(SETTINGS_KEY, settings);
  settingsPanel.classList.add("hidden");
}

// ── Events ────────────────────────────────────────────────────────────────────

// Timer click-to-pause (only when running)
timerWrap.addEventListener("click", () => {
  if (state.status === "running") handlePause();
});

startBtn.addEventListener("click", handleStart);
continueBtn.addEventListener("click", handleContinue);
resetBtn.addEventListener("click", handleReset);
doneResetBtn.addEventListener("click", handleReset);

presetBtns.forEach((btn) =>
  btn.addEventListener("click", () => loadPreset(parseFloat(btn.dataset.mins)))
);

setCustomBtn.addEventListener("click", handleSetCustom);
customMinsInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSetCustom();
});

openSettingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", discardSettings);
settingsDiscardBtn.addEventListener("click", discardSettings);
settingsSaveBtn.addEventListener("click", saveSettings);

themeModeSelect.addEventListener("change", () => {
  pendingSettings.themeMode = themeModeSelect.value;
  applyTheme(pendingSettings.themeMode);
});

designCards.forEach((card) => {
  card.addEventListener("click", () => {
    pendingSettings.design = card.dataset.design;
    designCards.forEach((c) => c.setAttribute("aria-pressed", String(c === card)));
    applyDesign(pendingSettings.design);
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const [savedTimer, savedSettings] = await Promise.all([
    store.get(TIMER_KEY),
    store.get(SETTINGS_KEY),
  ]);

  if (savedTimer) {
    state = { ...DEFAULT_TIMER, ...savedTimer };
    // Timer was running but the deadline already passed while popup was closed
    if (state.status === "running" && state.endTime && Date.now() >= state.endTime) {
      await handleDone();
      return;
    }
  }

  if (savedSettings) {
    settings = { ...DEFAULT_SETTINGS, ...savedSettings };
  }

  pendingSettings = { ...settings };
  applyTheme(settings.themeMode);
  applyDesign(settings.design);
  updateDisplay();

  if (state.status === "running") startTick();
}

init();
