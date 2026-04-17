const logic = window.QAPrioritiesLogic;

if (!logic) {
  throw new Error('QAPrioritiesLogic not loaded');
}

const { extractPrioritiesRows, parseCutTime, formatCutTime, compareLocationCodes } = logic;

const STORAGE_KEY = 'qa-priorities-todos-v1';
const SETTINGS_STORAGE_KEY = 'qa-priorities-settings-v1';
const THEME_STORAGE_KEY = 'qa-priorities-theme-v1';

const DEFAULT_SETTINGS = {
  daylightSavingsAdjustment: false,
  groups: [
    { title: 'pallets', values: ['a', 'b', 'c', 'lud', 'prm', 'slp'] },
    { title: 'efg', values: ['e', 'f', 'g', 'gft', 'hvc', 'hwk', 'hvb'] },
    { title: 'hjkl', values: ['h', 'j', 'k', 'l'] },
    { title: 'mnst', values: ['m', 'n', 's', 't', 'mez'] },
  ],
};

const views = {
  main: document.getElementById('main-view'),
  settings: document.getElementById('settings-view'),
};

const importBtn = document.getElementById('import-btn');
const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('status');
const groupedTables = document.getElementById('grouped-tables');
const openSettingsBtn = document.getElementById('open-settings');
const closeSettingsBtn = document.getElementById('close-settings');
const settingsSaveBtn = document.getElementById('settings-save');
const settingsResetBtn = document.getElementById('settings-reset');
const addGroupBtn = document.getElementById('add-group');
const groupsList = document.getElementById('groups-list');
const themeModeSelect = document.getElementById('theme-mode');
const settingsDstToggle = document.getElementById('settings-dst-toggle');

let tasksState = [];
let settingsState = loadSettings();
let themeMediaQuery = null;
let currentThemeMode = 'system';

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
      return raw ? JSON.parse(raw) : undefined;
    },
    async set(key, value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
  };
}

const storage = getStorage();

applyStaticIcons();

function setStatus(message, tone = '') {
  statusEl.textContent = message || '';
  statusEl.classList.remove('success', 'error');
  if (tone) statusEl.classList.add(tone);
}

function normalizeGroupValues(values) {
  if (!Array.isArray(values)) return [];
  const dedup = new Set();
  values.forEach((value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized) dedup.add(normalized);
  });
  return [...dedup];
}

function normalizeSettings(config) {
  const groups = Array.isArray(config?.groups)
    ? config.groups
        .map((group) => {
          const title = String(group?.title || '').trim();
          const values = normalizeGroupValues(group?.values);
          return title ? { title, values } : null;
        })
        .filter(Boolean)
    : [];

  const daylightSavingsAdjustment = Boolean(config?.daylightSavingsAdjustment);

  if (!groups.length) {
    return {
      daylightSavingsAdjustment,
      groups: DEFAULT_SETTINGS.groups.map((group) => ({
        title: group.title,
        values: normalizeGroupValues(group.values),
      })),
    };
  }

  return { daylightSavingsAdjustment, groups };
}

function loadSettings() {
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return normalizeSettings(DEFAULT_SETTINGS);
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch (err) {
    console.warn('Failed to load settings, falling back to defaults.', err);
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

function saveSettings(config) {
  settingsState = normalizeSettings(config);
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsState));
}

function showView(viewKey) {
  Object.values(views).forEach((view) => view.classList.add('hidden'));
  views[viewKey].classList.remove('hidden');
}

function parseGroupValues(raw) {
  const text = String(raw || '');
  return normalizeGroupValues(
    text
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function populateSettingsUI(config) {
  groupsList.replaceChildren();
  settingsDstToggle.checked = Boolean(config.daylightSavingsAdjustment);
  config.groups.forEach((group) => {
    addGroupToUI(group.title, group.values);
  });
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
  openSettingsBtn?.replaceChildren(createGearIcon());
  closeSettingsBtn?.replaceChildren(createXIcon('toolbar-icon'));
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

  fields.append(titleInput, valuesInput);

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

  moveControls.append(moveUpBtn, moveDownBtn);
  groupItem.append(moveControls, fields, removeBtn);

  groupsList.appendChild(groupItem);
}

function getSettingsFromUI() {
  const groups = [];
  groupsList.querySelectorAll('.group-item').forEach((item) => {
    const title = item.querySelector('.group-title-input')?.value.trim();
    const values = parseGroupValues(item.querySelector('.group-values-input')?.value);
    if (title) groups.push({ title, values });
  });
  return {
    daylightSavingsAdjustment: Boolean(settingsDstToggle?.checked),
    groups,
  };
}

function applyCutTimeAdjustmentToTask(task) {
  const cutTimeRaw = String(task.cutTimeRaw || '').trim();
  const parsed = parseCutTime(cutTimeRaw);
  const adjustedDate =
    parsed && settingsState.daylightSavingsAdjustment ? new Date(parsed.getTime() - 3600000) : parsed;

  return {
    ...task,
    cutTimeDate: adjustedDate,
    cutTimeDisplay: adjustedDate ? formatCutTime(adjustedDate) : cutTimeRaw,
  };
}

function refreshTaskTimes() {
  tasksState = tasksState
    .map(applyCutTimeAdjustmentToTask)
    .sort((left, right) => {
      const leftMs = left.cutTimeDate ? left.cutTimeDate.getTime() : Number.MAX_SAFE_INTEGER;
      const rightMs = right.cutTimeDate ? right.cutTimeDate.getTime() : Number.MAX_SAFE_INTEGER;
      if (leftMs !== rightMs) return leftMs - rightMs;
      return compareLocationCodes(left.currentLocation, right.currentLocation);
    });
}

function openSettings() {
  populateSettingsUI(settingsState);
  showView('settings');
}

function closeSettings() {
  showView('main');
}

function saveSettingsFromUI() {
  const config = getSettingsFromUI();
  if (!config.groups.length) {
    alert('Add at least one column group.');
    return;
  }
  saveSettings(config);
  refreshTaskTimes();
  renderTables();
  setStatus('Settings saved.', 'success');
  closeSettings();
}

function resetSettings() {
  populateSettingsUI(settingsState);
}

function getNormalizedLocation(task) {
  return String(task.currentLocation || '').trim().toUpperCase();
}

function extractLetterPrefix(location) {
  const idx = location.indexOf(':');
  if (idx === -1) return '';

  const afterColon = location.slice(idx + 1);
  const match = afterColon.match(/^[A-Z]+/);
  return match ? match[0] : '';
}

function getLocationGroupKey(location, validKeys) {
  const prefix = extractLetterPrefix(location);
  if (!prefix) return null;

  const prefixLower = prefix.toLowerCase();
  const lettersOnly = /^[A-Z]+$/;

  if (prefix.length >= 3 && lettersOnly.test(prefix) && validKeys.has(prefixLower)) {
    return prefixLower;
  }

  if (prefix.length >= 2) {
    const firstLetter = prefixLower[0];
    if (validKeys.has(firstLetter)) {
      return firstLetter;
    }
  }

  return null;
}

function taskMatchesGroup(task, group) {
  const location = getNormalizedLocation(task);
  if (!location) return false;
  if (!group.values.length) return false;

  const validKeys = new Set(group.values.map((value) => String(value || '').trim().toLowerCase()));
  const key = getLocationGroupKey(location, validKeys);
  return key !== null;
}

function groupTasksBySettings() {
  const groups = settingsState.groups.map((group) => ({
    title: group.title,
    values: group.values,
    tasks: [],
  }));

  const ungrouped = {
    title: 'Other',
    values: [],
    tasks: [],
  };

  tasksState.forEach((task) => {
    const matched = groups.find((group) => taskMatchesGroup(task, group));
    if (matched) {
      matched.tasks.push(task);
    } else {
      ungrouped.tasks.push(task);
    }
  });

  const withTasks = groups.filter((group) => group.tasks.length > 0);
  if (ungrouped.tasks.length > 0) {
    withTasks.push(ungrouped);
  }
  return withTasks;
}

function makeCell(content = '') {
  const cell = document.createElement('td');
  cell.textContent = content;
  return cell;
}

async function removeTaskById(taskId) {
  tasksState = tasksState.filter((task) => task.id !== taskId);
  await persistAndRender('Removed to-do row.', 'success');
}

async function removeGroupTasks(groupTitle) {
  const grouped = groupTasksBySettings().find((group) => group.title === groupTitle);
  if (!grouped) {
    setStatus(`No rows removed from ${groupTitle}.`);
    return;
  }

  const idsToRemove = new Set(grouped.tasks.map((task) => task.id));
  const before = tasksState.length;
  tasksState = tasksState.filter((task) => !idsToRemove.has(task.id));

  const removed = before - tasksState.length;
  if (!removed) {
    setStatus(`No rows removed from ${groupTitle}.`);
    return;
  }
  await persistAndRender(`Removed ${removed} to-dos from ${groupTitle}.`, 'success');
}

function renderTaskRow(task) {
  const row = document.createElement('tr');
  if (task.completed) row.classList.add('completed');

  const checkboxCell = document.createElement('td');
  checkboxCell.className = 'cell-center';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(task.completed);
  checkbox.addEventListener('change', async () => {
    task.completed = checkbox.checked;
    await persistAndRender('Updated completion state.', 'success');
  });
  checkboxCell.appendChild(checkbox);

  const locCell = makeCell(task.currentLocation || '');

  const upcCell = makeCell(task.upc || '');
  if (task.upc) {
    const gtinLinkIcon = document.createElement('a');
    gtinLinkIcon.href = `https://atom.walmart.com/item-management/all-about-an-item?gtin=${encodeURIComponent(task.upc)}`;
    gtinLinkIcon.target = '_blank';
    gtinLinkIcon.rel = 'noopener noreferrer';
    gtinLinkIcon.className = 'gtin-link-icon';
    gtinLinkIcon.textContent = '🔗';
    gtinLinkIcon.setAttribute('aria-label', `Open ${task.upc} in Item Management`);
    gtinLinkIcon.title = 'Open in Item Management';
    upcCell.append(' ', gtinLinkIcon);
  }

  const qtyCell = makeCell(task.quantity || '');
  const cutTimeCell = makeCell(task.cutTimeDisplay || '');

  const deleteCell = document.createElement('td');
  deleteCell.className = 'cell-center';
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '×';
  deleteBtn.title = 'Remove to-do';
  deleteBtn.addEventListener('click', async () => {
    await removeTaskById(task.id);
  });
  deleteCell.appendChild(deleteBtn);

  row.append(checkboxCell, locCell, upcCell, qtyCell, cutTimeCell, deleteCell);
  return row;
}

function renderGroupTable(group) {
  const card = document.createElement('section');
  card.className = 'group-table-card';

  const header = document.createElement('div');
  header.className = 'group-table-header';

  const heading = document.createElement('h3');
  heading.textContent = `${group.title} (${group.tasks.length})`;

  const removeTableBtn = document.createElement('button');
  removeTableBtn.type = 'button';
  removeTableBtn.className = 'delete-table-btn';
  removeTableBtn.title = `Remove all rows in ${group.title}`;
  removeTableBtn.appendChild(createXIcon('close-icon'));
  removeTableBtn.addEventListener('click', async () => {
    if (group.title === 'Other') {
      const ids = new Set(group.tasks.map((task) => task.id));
      tasksState = tasksState.filter((task) => !ids.has(task.id));
      await persistAndRender(`Removed ${ids.size} to-dos from Other.`, 'success');
      return;
    }
    await removeGroupTasks(group.title);
  });

  header.append(heading, removeTableBtn);

  const wrap = document.createElement('section');
  wrap.className = 'table-wrap grouped';

  const table = document.createElement('table');
  table.className = 'todo-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th aria-label="Completed"></th>
        <th>Location</th>
        <th>UPC</th>
        <th>Quantity</th>
        <th>Cut Time</th>
        <th>Remove</th>
      </tr>
    </thead>
  `;

  const body = document.createElement('tbody');
  group.tasks.forEach((task) => {
    body.appendChild(renderTaskRow(task));
  });

  table.appendChild(body);
  wrap.appendChild(table);

  card.append(header, wrap);
  return card;
}

function renderTables() {
  groupedTables.replaceChildren();

  if (!tasksState.length) {
    const placeholder = document.createElement('section');
    placeholder.className = 'table-wrap';
    placeholder.innerHTML = `
      <table class="todo-table">
        <tbody>
          <tr>
            <td colspan="6" class="placeholder">Import a priorities file to begin.</td>
          </tr>
        </tbody>
      </table>
    `;
    groupedTables.appendChild(placeholder);
    return;
  }

  const groupsWithTasks = groupTasksBySettings();
  groupsWithTasks.forEach((group) => {
    groupedTables.appendChild(renderGroupTable(group));
  });
}

async function persistAndRender(statusMessage, tone) {
  await storage.set(STORAGE_KEY, tasksState);
  renderTables();
  if (statusMessage) setStatus(statusMessage, tone);
}

async function readXlsxRows(file) {
  if (!window.XLSX?.read || !window.XLSX?.utils?.sheet_to_json) {
    throw new Error('XLSX parser not available.');
  }

  const data = await file.arrayBuffer();
  const workbook = window.XLSX.read(data, { type: 'array' });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) {
    throw new Error('No worksheet found in Excel file.');
  }

  return window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
}

async function importFile(file) {
  if (!file) return;
  setStatus(`Reading ${file.name}...`);
  const rows = await readXlsxRows(file);
  const result = extractPrioritiesRows(rows, {
    daylightSavingsAdjustment: settingsState.daylightSavingsAdjustment,
  });
  tasksState = result.tasks;
  await persistAndRender(
    `Imported ${result.tasks.length} to-dos from ${result.totalRows} rows.`,
    'success',
  );
}

async function init() {
  applyTheme(getThemePreference());
  const saved = await storage.get(STORAGE_KEY);
  if (Array.isArray(saved)) {
    tasksState = saved;
    refreshTaskTimes();
  }
  renderTables();
}

importBtn?.addEventListener('click', () => fileInput?.click());
openSettingsBtn?.addEventListener('click', openSettings);
closeSettingsBtn?.addEventListener('click', closeSettings);
settingsSaveBtn?.addEventListener('click', saveSettingsFromUI);
settingsResetBtn?.addEventListener('click', resetSettings);
addGroupBtn?.addEventListener('click', () => addGroupToUI());
themeModeSelect?.addEventListener('change', (event) => applyTheme(event.target.value));

fileInput?.addEventListener('change', async (event) => {
  try {
    await importFile(event.target.files?.[0]);
  } catch (err) {
    console.error(err);
    setStatus(err instanceof Error ? err.message : 'Import failed.', 'error');
  } finally {
    event.target.value = '';
  }
});

init();
