const logic = window.QALogic;

if (!logic) {
  throw new Error('QALogic not loaded');
}

const {
  extractLocationsFromCSVText,
  extractPrioritiesFromXlsxRows,
} = logic;

const INPUTS_STORAGE_KEY = 'qa-locations-inputs-v1';
const THEME_STORAGE_KEY = 'qa-locations-theme-v1';

const pickLocationsBtn = document.getElementById('pick-locations');
const pickPrioritiesBtn = document.getElementById('pick-priorities');
const locationsFileInput = document.getElementById('locations-file');
const prioritiesFileInput = document.getElementById('priorities-file');
const locationsPreview = document.getElementById('locations-preview');
const prioritiesPreview = document.getElementById('priorities-preview');
const locationsStatus = document.getElementById('locations-status');
const prioritiesStatus = document.getElementById('priorities-status');
const closeImportBtn = document.getElementById('close-import');
let themeMediaQuery = null;
let currentThemeMode = 'system';

function getThemePreference() {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
    return savedTheme;
  }
  return 'system';
}

function resolveTheme(themeMode) {
  if (themeMode === 'light' || themeMode === 'dark') {
    return themeMode;
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applySystemTheme() {
  if (currentThemeMode !== 'system') return;
  document.documentElement.setAttribute('data-theme', resolveTheme('system'));
}

function removeThemeListener() {
  if (!themeMediaQuery) return;
  if (typeof themeMediaQuery.removeEventListener === 'function') {
    themeMediaQuery.removeEventListener('change', applySystemTheme);
  } else if (typeof themeMediaQuery.removeListener === 'function') {
    themeMediaQuery.removeListener(applySystemTheme);
  }
  themeMediaQuery = null;
}

function setupThemeListener(themeMode) {
  removeThemeListener();
  if (themeMode !== 'system' || typeof window.matchMedia !== 'function') {
    return;
  }
  themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (typeof themeMediaQuery.addEventListener === 'function') {
    themeMediaQuery.addEventListener('change', applySystemTheme);
  } else if (typeof themeMediaQuery.addListener === 'function') {
    themeMediaQuery.addListener(applySystemTheme);
  }
}

function applyTheme(themeMode) {
  const nextThemeMode = themeMode === 'light' || themeMode === 'dark' ? themeMode : 'system';
  currentThemeMode = nextThemeMode;
  document.documentElement.setAttribute('data-theme', resolveTheme(nextThemeMode));
  setupThemeListener(nextThemeMode);
}

function getStorage() {
  if (window.chrome?.storage?.local) {
    return {
      async get(key) {
        const result = await window.chrome.storage.local.get(key);
        return result?.[key];
      },
      async set(key, value) {
        await window.chrome.storage.local.set({ [key]: value });
      },
    };
  }

  return {
    async get(key) {
      const raw = window.localStorage.getItem(key);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw);
      } catch (err) {
        console.warn('Failed to parse stored value.', err);
        return undefined;
      }
    },
    async set(key, value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
  };
}

const storage = getStorage();

function setStatus(kind, message, tone = '') {
  const el = kind === 'locations' ? locationsStatus : prioritiesStatus;
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('success', 'error');
  if (tone) {
    el.classList.add(tone);
  }
}

async function loadStoredInputs() {
  const saved = await storage.get(INPUTS_STORAGE_KEY);
  if (!saved || typeof saved !== 'object') return;
  if (typeof saved.locations === 'string') {
    locationsPreview.value = saved.locations;
  }
  if (Array.isArray(saved.priorityEntries)) {
    prioritiesPreview.value = saved.priorityEntries
      .map((entry) => `${entry.location}${entry.cutTime ? ` | ${entry.cutTime}` : ''}`)
      .join('\n');
  }
}

async function saveStoredInputs(nextPartial) {
  const current = (await storage.get(INPUTS_STORAGE_KEY)) || {};
  await storage.set(INPUTS_STORAGE_KEY, {
    locations: typeof current.locations === 'string' ? current.locations : '',
    priorityEntries: Array.isArray(current.priorityEntries) ? current.priorityEntries : [],
    ...nextPartial,
  });
}

async function readXlsxRows(file) {
  if (!window.XLSX?.read || !window.XLSX?.utils?.sheet_to_json) {
    throw new Error('XLSX parser not available. Expected vendor/xlsx.full.min.js.');
  }

  const data = await file.arrayBuffer();
  const workbook = window.XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) {
    throw new Error('No worksheet found in Excel file.');
  }

  const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });

  return rows.map((row) => (Array.isArray(row) ? row : []));
}

function openPicker(inputEl) {
  if (!inputEl) return;
  try {
    if (typeof inputEl.showPicker === 'function') {
      inputEl.showPicker();
      return;
    }
  } catch (err) {
    console.warn('showPicker failed, using click().', err);
  }
  inputEl.click();
}

async function importLocations(file) {
  setStatus('locations', `Reading ${file.name}...`);
  const csvText = await file.text();
  const result = extractLocationsFromCSVText(csvText);
  const text = result.values.join('\n');
  locationsPreview.value = text;
  await saveStoredInputs({ locations: text });
  setStatus(
    'locations',
    `Imported ${result.values.length} unique locations from ${result.rowCount} rows.`,
    'success',
  );
}

async function importPriorities(file) {
  setStatus('priorities', `Reading ${file.name}...`);
  const rows = await readXlsxRows(file);
  const result = extractPrioritiesFromXlsxRows(rows);
  const text = result.entries
    .map((entry) => `${entry.location}${entry.cutTime ? ` | ${entry.cutTime}` : ''}`)
    .join('\n');
  prioritiesPreview.value = text;
  await saveStoredInputs({ priorityEntries: result.entries });
  setStatus(
    'priorities',
    `Imported ${result.entries.length} unique priority locations from ${result.rowCount} rows.`,
    'success',
  );
}

async function handleFile(kind, file) {
  if (!file) return;
  try {
    if (kind === 'locations') {
      await importLocations(file);
    } else {
      await importPriorities(file);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed.';
    setStatus(kind, message, 'error');
    console.error(`Failed to import ${kind}`, err);
  }
}

function applyStaticIcons() {
  if (!closeImportBtn) return;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('toolbar-icon');

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M18 6L6 18M6 6l12 12');
  svg.appendChild(path);

  closeImportBtn.replaceChildren(svg);
}

function focusRequestedTarget() {
  const params = new URLSearchParams(window.location.search);
  const target = params.get('target');
  if (target === 'locations') {
    pickLocationsBtn?.focus();
  } else if (target === 'priorities') {
    pickPrioritiesBtn?.focus();
  }
}

pickLocationsBtn?.addEventListener('click', () => {
  setStatus('locations', 'Choose a CSV file...');
  openPicker(locationsFileInput);
});

pickPrioritiesBtn?.addEventListener('click', () => {
  setStatus('priorities', 'Choose an XLSX file...');
  openPicker(prioritiesFileInput);
});

locationsFileInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  await handleFile('locations', file);
  event.target.value = '';
});

prioritiesFileInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  await handleFile('priorities', file);
  event.target.value = '';
});

closeImportBtn?.addEventListener('click', () => window.close());

async function init() {
  applyTheme(getThemePreference());
  applyStaticIcons();
  await loadStoredInputs();
  focusRequestedTarget();
}

init();
