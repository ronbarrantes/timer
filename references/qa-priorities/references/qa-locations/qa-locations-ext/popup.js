const logic = window.QALogic;

if (!logic) {
  throw new Error('QALogic not loaded');
}

const {
  parseLines,
  compareLocationCodes,
  uniqueCaseInsensitive,
  parseGroupValues,
  normalizeConfig,
  groupLocations,
  groupByTitle,
  buildOutputMatrix,
  buildPriorityToneByLocation,
  extractLocationsFromCSVText,
  extractPrioritiesFromXlsxRows,
} = logic;

const STORAGE_KEY = 'qa-locations-settings-v1';
const INPUTS_STORAGE_KEY = 'qa-locations-inputs-v1';
const VIEW_STORAGE_KEY = 'qa-locations-view-v1';
const HOLD_VIEW_KEY = 'qa-locations-hold-view-v1';
const THEME_STORAGE_KEY = 'qa-locations-theme-v1';
const DEFAULT_SETTINGS = {
  groups: [
    { title: 'pallets', values: ['a', 'b', 'c', 'lud', 'prm', 'slp'] },
    { title: 'efg', values: ['e', 'f', 'g', 'gft', 'hvc', 'hwk', 'hvb'] },
    { title: 'hjkl', values: ['h', 'j', 'k', 'l'] },
    { title: 'mnst', values: ['m', 'n', 's', 't', 'mez'] },
  ],
  maxRows: 20,
  columnGap: 1,
  colorsMode: false,
};

const views = {
  main: document.getElementById('main-view'),
  settings: document.getElementById('settings-view'),
  result: document.getElementById('result-view'),
};

const locationsInput = document.getElementById('locations');
const tableContainer = document.getElementById('table-container');
const summary = document.getElementById('summary');
const resultActionStatus = document.getElementById('result-action-status');
const openImportsBtn = document.getElementById('open-imports-btn');
const pickLocationsBtn = document.getElementById('pick-locations-btn');
const pickPrioritiesBtn = document.getElementById('pick-priorities-btn');
const locationsFileInput = document.getElementById('locations-file');
const prioritiesFileInput = document.getElementById('priorities-file');
const locationsImportStatus = document.getElementById('locations-import-status');
const prioritiesImportStatus = document.getElementById('priorities-import-status');

const createBtn = document.getElementById('create');
const resetBtn = document.getElementById('reset');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsSaveBtn = document.getElementById('settings-save');
const settingsResetBtn = document.getElementById('settings-reset');
const addGroupBtn = document.getElementById('add-group');
const resultBackBtn = document.getElementById('result-back');
const copyTableImageBtn = document.getElementById('copy-table-image');
const saveTableImageBtn = document.getElementById('save-table-image');

const groupsList = document.getElementById('groups-list');
const maxRowsInput = document.getElementById('max-rows');
const columnGapInput = document.getElementById('column-gap');
const themeModeSelect = document.getElementById('theme-mode');
const colorsModeToggle = document.getElementById('colors-mode');
const holdViewToggle = document.getElementById('hold-view');

let settingsState = loadSettings();
let holdViewEnabled = false;
let priorityEntriesState = [];
let locationsState = '';
let themeMediaQuery = null;
let currentThemeMode = 'system';

function getLocationsText() {
  return locationsInput ? locationsInput.value : locationsState;
}

function setLocationsText(value) {
  locationsState = value || '';
  if (locationsInput) {
    locationsInput.value = locationsState;
  }
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
      async remove(key) {
        await window.chrome.storage.local.remove(key);
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
    async remove(key) {
      window.localStorage.removeItem(key);
    },
  };
}

const storage = getStorage();

applyStaticIcons();

function showView(viewKey) {
  Object.values(views).forEach((view) => view.classList.add('hidden'));
  views[viewKey].classList.remove('hidden');
  if (holdViewEnabled) {
    storage.set(VIEW_STORAGE_KEY, viewKey);
  }
}

function loadSettings() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return normalizeConfig(DEFAULT_SETTINGS);
  try {
    return normalizeConfig(JSON.parse(raw));
  } catch (err) {
    console.warn('Failed to load settings, falling back to defaults.', err);
    return normalizeConfig(DEFAULT_SETTINGS);
  }
}

function saveSettings(config) {
  const normalized = normalizeConfig(config);
  settingsState = normalized;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

async function loadHoldViewEnabled() {
  const saved = await storage.get(HOLD_VIEW_KEY);
  return saved === true;
}

function setHoldViewEnabled(enabled) {
  holdViewEnabled = enabled;
  storage.set(HOLD_VIEW_KEY, enabled);
  if (enabled) {
    storage.set(VIEW_STORAGE_KEY, getCurrentViewKey());
  }
}

function getCurrentViewKey() {
  return Object.keys(views).find((key) => !views[key].classList.contains('hidden')) || 'main';
}

async function loadLastViewKey() {
  const saved = await storage.get(VIEW_STORAGE_KEY);
  if (saved && views[saved]) return saved;
  return 'main';
}

async function loadInputs() {
  const saved = await storage.get(INPUTS_STORAGE_KEY);
  if (!saved || typeof saved !== 'object') return;
  if (typeof saved.locations === 'string') setLocationsText(saved.locations);
  if (Array.isArray(saved.priorityEntries)) {
    priorityEntriesState = saved.priorityEntries
      .map((entry) => ({
        location: String(entry?.location || '').trim(),
        cutTime: entry?.cutTime ? String(entry.cutTime) : null,
      }))
      .filter((entry) => entry.location);
  }
}

function saveInputs() {
  storage.set(INPUTS_STORAGE_KEY, {
    locations: getLocationsText(),
    priorityEntries: priorityEntriesState,
  });
}

function clearInputsStorage() {
  storage.remove(INPUTS_STORAGE_KEY);
}

function setResultActionStatus(message, tone = '') {
  if (!resultActionStatus) return;
  resultActionStatus.textContent = message || '';
  resultActionStatus.classList.remove('success', 'error');
  if (tone) {
    resultActionStatus.classList.add(tone);
  }
}

function setImportStatus(kind, message, tone = '') {
  const el = kind === 'locations' ? locationsImportStatus : prioritiesImportStatus;
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('success', 'error');
  if (tone) {
    el.classList.add(tone);
  }
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

async function importLocationsFromFile(file) {
  setImportStatus('locations', `Reading ${file.name}...`);
  const csvText = await file.text();
  const result = extractLocationsFromCSVText(csvText);
  setLocationsText(result.values.join('\n'));
  saveInputs();
  setImportStatus(
    'locations',
    `Imported ${result.values.length} unique locations from ${result.rowCount} rows.`,
    'success',
  );
}

async function importPrioritiesFromFile(file) {
  setImportStatus('priorities', `Reading ${file.name}...`);
  const rows = await readXlsxRows(file);
  const result = extractPrioritiesFromXlsxRows(rows);
  priorityEntriesState = result.entries;
  saveInputs();
  setImportStatus(
    'priorities',
    `Imported ${result.entries.length} unique priority locations from ${result.rowCount} rows.`,
    'success',
  );
}

async function handleImportFile(kind, file) {
  if (!file) return;
  try {
    if (kind === 'locations') {
      await importLocationsFromFile(file);
    } else {
      await importPrioritiesFromFile(file);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed.';
    setImportStatus(kind, message, 'error');
    console.error(`Failed to import ${kind}`, err);
  }
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate PNG image.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function renderTablePngBlob() {
  const table = tableContainer.querySelector('table');
  if (!table) {
    throw new Error('No table available to export.');
  }

  if (typeof window.html2canvas !== 'function') {
    throw new Error('html2canvas is not loaded. Add vendor/html2canvas.min.js to enable PNG export.');
  }
  const canvas = await window.html2canvas(table, {
    backgroundColor: '#ffffff',
    scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1)),
    useCORS: true,
  });
  return canvasToPngBlob(canvas);
}

function downloadPngBlob(blob, filename = 'qa-locations-table.png') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyTableAsPng() {
  setResultActionStatus('Rendering PNG...');

  try {
    const pngBlob = await renderTablePngBlob();

    if (navigator.clipboard?.write && typeof window.ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          'image/png': pngBlob,
        }),
      ]);
      setResultActionStatus('Table copied to clipboard as PNG. Paste into chat.', 'success');
      return;
    }

    downloadPngBlob(pngBlob);
    setResultActionStatus('Clipboard image copy unavailable. Downloaded qa-locations-table.png.', 'success');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to render/copy PNG.';
    setResultActionStatus(message, 'error');
    console.error('Failed to copy table as PNG', err);
  }
}

async function saveTableAsPng() {
  setResultActionStatus('Rendering PNG...');

  try {
    const pngBlob = await renderTablePngBlob();
    downloadPngBlob(pngBlob);
    setResultActionStatus('Saved qa-locations-table.png.', 'success');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save PNG.';
    setResultActionStatus(message, 'error');
    console.error('Failed to save table as PNG', err);
  }
}

function openImporterPage(target) {
  const url = new URL(chrome.runtime.getURL('import.html'));
  if (target) {
    url.searchParams.set('target', target);
  }
  window.open(url.toString(), '_blank');
}

function renderTable(matrix, priorityToneByLocation) {
  tableContainer.replaceChildren();

  if (!matrix.headers.length) {
    tableContainer.textContent = 'No data to display.';
    return;
  }

  const table = document.createElement('table');
  const gapColumns = settingsState.columnGap > 0 ? 1 : Math.max(0, settingsState.columnGap);
  const gapWidthPx = settingsState.columnGap > 0 ? settingsState.columnGap * 16 : 0;
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  matrix.groupTitles.forEach((title, index) => {
    const th = document.createElement('th');
    const colSpan = matrix.groupColumns[index] || 1;
    th.textContent = title;
    th.colSpan = colSpan;
    headerRow.appendChild(th);

    if (index < matrix.groupTitles.length - 1 && matrix.groupColumns[index] !== undefined) {
      for (let g = 0; g < gapColumns; g += 1) {
        const gap = document.createElement('th');
        gap.classList.add('gap');
        if (gapWidthPx > 0) {
          gap.style.width = `${gapWidthPx}px`;
          gap.style.minWidth = `${gapWidthPx}px`;
        }
        headerRow.appendChild(gap);
      }
    }
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  matrix.rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((value, idx) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (!matrix.headers[idx]) {
        td.classList.add('gap');
        if (gapWidthPx > 0) {
          td.style.width = `${gapWidthPx}px`;
          td.style.minWidth = `${gapWidthPx}px`;
        }
      }
      if (value) {
        const toneClass = priorityToneByLocation.get(String(value).trim().toUpperCase());
        if (toneClass) {
          td.classList.add(toneClass);
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableContainer.appendChild(table);
}

function createArrangement() {
  const locations = uniqueCaseInsensitive(parseLines(getLocationsText())).sort(compareLocationCodes);

  if (locations.length === 0) {
    summary.textContent = 'Add at least one location.';
    tableContainer.replaceChildren();
    showView('result');
    return;
  }

  const config = settingsState;
  const grouped = groupLocations(locations, config);
  const titleGrouped = groupByTitle(grouped, config);
  const titleOrder = config.groups.map((group) => group.title);
  const matrix = buildOutputMatrix(titleOrder, titleGrouped, config.maxRows, config.columnGap);
  const priorityToneByLocation = buildPriorityToneByLocation(
    locations,
    priorityEntriesState,
    new Date(),
    config.colorsMode,
  );

  renderTable(matrix, priorityToneByLocation);

  const maxRowsLabel = config.maxRows > 0 ? config.maxRows : 'no limit';
  summary.textContent = `${locations.length} locations, ${priorityEntriesState.length} priorities, ${matrix.headers.length} columns, max rows ${maxRowsLabel}, gap ${config.columnGap}.`;
  showView('result');
}

function resetForm() {
  setLocationsText('');
  priorityEntriesState = [];
  clearInputsStorage();
}

function openSettings() {
  populateSettingsUI(settingsState);
  showView('settings');
}

function closeSettings() {
  showView('main');
}

function populateSettingsUI(config) {
  groupsList.replaceChildren();
  config.groups.forEach((group) => {
    addGroupToUI(group.title, group.values);
  });
  maxRowsInput.value = config.maxRows;
  columnGapInput.value = config.columnGap;
  if (colorsModeToggle) {
    colorsModeToggle.checked = config.colorsMode !== false;
  }
}

function addGroupToUI(title = '', values = []) {
  const groupItem = document.createElement('div');
  groupItem.className = 'group-item';

  const fields = document.createElement('div');
  fields.className = 'group-fields';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'group-title-input';
  titleInput.placeholder = 'Column title';
  titleInput.value = title;

  const valuesInput = document.createElement('input');
  valuesInput.type = 'text';
  valuesInput.className = 'group-values-input';
  valuesInput.placeholder = 'Values (A B C or MEZ PRM HVC)';
  valuesInput.value = Array.isArray(values) ? values.join(', ') : String(values || '');

  fields.appendChild(titleInput);
  fields.appendChild(valuesInput);

  const moveControls = document.createElement('div');
  moveControls.className = 'group-move-controls';

  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.className = 'icon-btn move-group';
  moveUpBtn.title = 'Move up';
  moveUpBtn.appendChild(createChevronIcon('up'));
  moveUpBtn.addEventListener('click', () => {
    const prev = groupItem.previousElementSibling;
    if (prev) groupsList.insertBefore(groupItem, prev);
  });

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.className = 'icon-btn move-group';
  moveDownBtn.title = 'Move down';
  moveDownBtn.appendChild(createChevronIcon('down'));
  moveDownBtn.addEventListener('click', () => {
    const next = groupItem.nextElementSibling;
    if (next) groupsList.insertBefore(next, groupItem);
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'icon-btn remove-group';
  removeBtn.title = 'Remove column';
  removeBtn.appendChild(createXIcon());
  removeBtn.addEventListener('click', () => {
    groupItem.remove();
  });

  moveControls.appendChild(moveUpBtn);
  moveControls.appendChild(moveDownBtn);

  groupItem.appendChild(moveControls);
  groupItem.appendChild(fields);
  groupItem.appendChild(removeBtn);

  groupsList.appendChild(groupItem);
}

function createChevronIcon(direction) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('move-icon');

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'butt');
  path.setAttribute('stroke-linejoin', 'miter');
  path.setAttribute('stroke-width', '2.25');
  path.setAttribute(
    'd',
    direction === 'up' ? 'M4.5 15L12 7.5L19.5 15' : 'M4.5 9L12 16.5L19.5 9',
  );

  svg.appendChild(path);
  return svg;
}

function createXIcon(className = 'close-icon') {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(className);

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('d', 'M18 6L6 18M6 6l12 12');

  svg.appendChild(path);
  return svg;
}

function createArrowLeftIcon() {
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
  path.setAttribute('d', 'M19 12H5M12 19l-7-7 7-7');
  svg.appendChild(path);
  return svg;
}

function createGearIcon() {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('toolbar-icon');

  const circle = document.createElementNS(svgNS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '3');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  svg.appendChild(circle);

  const teeth = document.createElementNS(svgNS, 'path');
  teeth.setAttribute('fill', 'none');
  teeth.setAttribute('stroke', 'currentColor');
  teeth.setAttribute('stroke-linecap', 'round');
  teeth.setAttribute('stroke-linejoin', 'round');
  teeth.setAttribute('stroke-width', '2');
  teeth.setAttribute(
    'd',
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .99 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51.99H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51.99z',
  );
  svg.appendChild(teeth);
  return svg;
}

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

function removeThemeListener() {
  if (!themeMediaQuery) return;
  if (typeof themeMediaQuery.removeEventListener === 'function') {
    themeMediaQuery.removeEventListener('change', applySystemTheme);
  } else if (typeof themeMediaQuery.removeListener === 'function') {
    themeMediaQuery.removeListener(applySystemTheme);
  }
  themeMediaQuery = null;
}

function applySystemTheme() {
  if (currentThemeMode !== 'system') return;
  document.documentElement.setAttribute('data-theme', resolveTheme('system'));
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
  window.localStorage.setItem(THEME_STORAGE_KEY, nextThemeMode);
  document.documentElement.setAttribute('data-theme', resolveTheme(nextThemeMode));
  setupThemeListener(nextThemeMode);

  if (themeModeSelect) {
    themeModeSelect.value = nextThemeMode;
  }
}

function applyStaticIcons() {
  if (openSettingsBtn) {
    openSettingsBtn.replaceChildren(createGearIcon());
  }
  if (closeSettingsBtn) {
    closeSettingsBtn.replaceChildren(createXIcon('toolbar-icon'));
  }
  if (resultBackBtn) {
    resultBackBtn.replaceChildren(createArrowLeftIcon());
  }
}

function getSettingsFromUI() {
  const groupItems = groupsList.querySelectorAll('.group-item');
  const groups = [];

  groupItems.forEach((item) => {
    const title = item.querySelector('.group-title-input')?.value.trim();
    const values = parseGroupValues(item.querySelector('.group-values-input')?.value);

    if (title) {
      groups.push({ title, values });
    }
  });

  return {
    groups,
    maxRows: Number(maxRowsInput.value) || 20,
    columnGap: Number(columnGapInput.value) || 0,
    colorsMode: Boolean(colorsModeToggle?.checked),
  };
}

function saveSettingsFromUI() {
  const config = getSettingsFromUI();

  if (config.groups.length === 0) {
    alert('Add at least one column group.');
    return;
  }

  if (config.maxRows < 0) {
    alert('Max rows must be 0 or higher.');
    return;
  }

  saveSettings(config);
  showView('main');
}

function resetSettings() {
  populateSettingsUI(settingsState);
}

createBtn.addEventListener('click', createArrangement);
resetBtn.addEventListener('click', resetForm);
locationsInput?.addEventListener('input', saveInputs);
openImportsBtn?.addEventListener('click', () => openImporterPage('locations'));
pickLocationsBtn?.addEventListener('click', () => {
  setImportStatus('locations', 'Choose a CSV file...');
  openPicker(locationsFileInput);
});
pickPrioritiesBtn?.addEventListener('click', () => {
  setImportStatus('priorities', 'Choose an XLSX file...');
  openPicker(prioritiesFileInput);
});
locationsFileInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  await handleImportFile('locations', file);
  event.target.value = '';
});
prioritiesFileInput?.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  await handleImportFile('priorities', file);
  event.target.value = '';
});
openSettingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
settingsSaveBtn.addEventListener('click', saveSettingsFromUI);
settingsResetBtn.addEventListener('click', resetSettings);
addGroupBtn.addEventListener('click', () => addGroupToUI());
resultBackBtn.addEventListener('click', () => showView('main'));
copyTableImageBtn?.addEventListener('click', copyTableAsPng);
saveTableImageBtn?.addEventListener('click', saveTableAsPng);
themeModeSelect?.addEventListener('change', (event) => applyTheme(event.target.value));

holdViewToggle?.addEventListener('change', (event) => {
  setHoldViewEnabled(Boolean(event.target.checked));
});


function handlePopupQueryActions() {
  const params = new URLSearchParams(window.location.search);
  const shouldAutoCreate = params.get('autocreate') === '1';
  const requestedView = params.get('view');

  if (requestedView === 'result' || shouldAutoCreate) {
    createArrangement();
    return true;
  }

  return false;
}

async function init() {
  applyTheme(getThemePreference());
  await loadInputs();

  if (handlePopupQueryActions()) {
    return;
  }

  holdViewEnabled = await loadHoldViewEnabled();
  if (holdViewToggle) {
    holdViewToggle.checked = holdViewEnabled;
  }
  if (holdViewEnabled) {
    const lastView = await loadLastViewKey();
    if (lastView === 'result') {
      createArrangement();
    } else if (lastView === 'settings') {
      openSettings();
    } else {
      showView(lastView);
    }
  }
}

init();
