(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    global.QAPrioritiesLogic = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const REQUIRED_COLUMNS = [
    'Gtin',
    'Earliest Cut-time',
    'Quantity',
    'Current Location',
    'Container Tag',
  ];

  const TRACKED_TAGS = new Set([
    'QA_HOLD_PICKING',
    'QA_HOLD_PUTAWAY',
    'QA_HOLD_REPLENISHMENT',
    'QA_HOLD_REWAREHOUSING',
  ]);

  function tokenize(value) {
    return value
      .toUpperCase()
      .match(/[A-Z]+|\d+|[^A-Z\d]+/g)
      ?.map((chunk) => (/^\d+$/.test(chunk) ? Number(chunk) : chunk)) ?? [value];
  }

  function compareLocationCodes(a, b) {
    const partsA = tokenize(a);
    const partsB = tokenize(b);
    const max = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < max; i += 1) {
      const left = partsA[i];
      const right = partsB[i];
      if (left === undefined) return -1;
      if (right === undefined) return 1;

      if (typeof left === 'number' && typeof right === 'number') {
        if (left !== right) return left - right;
        continue;
      }

      const cmp = String(left).localeCompare(String(right));
      if (cmp !== 0) return cmp;
    }

    return 0;
  }

  function getColumnIndex(headers, columnName) {
    return (headers || []).findIndex((header) => String(header || '').trim() === columnName);
  }

  function parseCutTime(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;

    const normalized = value.replace(/-/g, '/').replace(/\s+/g, ' ');
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) return date;

    const match = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)/i);
    if (!match) return null;
    let hour = Number(match[4]) % 12;
    if (match[6].toUpperCase() === 'PM') {
      hour += 12;
    }
    return new Date(
      Number(match[3]),
      Number(match[1]) - 1,
      Number(match[2]),
      hour,
      Number(match[5]),
      0,
      0,
    );
  }

  function formatCutTime(dateObj) {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
    const baseTime = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: dateObj.getMinutes() === 0 ? undefined : '2-digit',
      hour12: true,
    }).format(dateObj).replace(/\s/g, '').toLowerCase();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfCutDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const dayDiff = Math.round((startOfCutDay.getTime() - startOfToday.getTime()) / 86400000);

    return dayDiff === 1 ? `${baseTime}+` : baseTime;
  }

  function extractPrioritiesRows(rows, options = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Excel file is empty.');
    }

    const headers = rows[0].map((cell) => String(cell || '').trim());
    REQUIRED_COLUMNS.forEach((column) => {
      if (getColumnIndex(headers, column) === -1) {
        throw new Error(`Excel column "${column}" not found.`);
      }
    });

    const gtinIdx = getColumnIndex(headers, 'Gtin');
    const cutTimeIdx = getColumnIndex(headers, 'Earliest Cut-time');
    const qtyIdx = getColumnIndex(headers, 'Quantity');
    const locationIdx = getColumnIndex(headers, 'Current Location');
    const tagIdx = getColumnIndex(headers, 'Container Tag');

    const tasks = [];

    rows.slice(1).forEach((row, rowOffset) => {
      const tag = String(row[tagIdx] || '').trim().toUpperCase();
      if (!TRACKED_TAGS.has(tag)) return;

      const location = String(row[locationIdx] || '').trim();
      if (!location) return;

      const cutTimeRaw = String(row[cutTimeIdx] || '').trim();
      const cutDate = parseCutTime(cutTimeRaw);
      const adjustedCutDate =
        cutDate && options.daylightSavingsAdjustment ? new Date(cutDate.getTime() - 3600000) : cutDate;

      tasks.push({
        id: `${rowOffset}-${String(row[gtinIdx] || '').trim()}-${location}`,
        completed: false,
        upc: String(row[gtinIdx] || '').trim(),
        quantity: String(row[qtyIdx] || '').trim(),
        currentLocation: location,
        containerTag: tag,
        cutTimeRaw,
        cutTimeDate: adjustedCutDate,
        cutTimeDisplay: adjustedCutDate ? formatCutTime(adjustedCutDate) : cutTimeRaw,
      });
    });

    tasks.sort((left, right) => {
      const leftMs = left.cutTimeDate ? left.cutTimeDate.getTime() : Number.MAX_SAFE_INTEGER;
      const rightMs = right.cutTimeDate ? right.cutTimeDate.getTime() : Number.MAX_SAFE_INTEGER;
      if (leftMs !== rightMs) return leftMs - rightMs;
      return compareLocationCodes(left.currentLocation, right.currentLocation);
    });

    return {
      tasks,
      totalRows: Math.max(0, rows.length - 1),
    };
  }

  return {
    TRACKED_TAGS,
    tokenize,
    compareLocationCodes,
    getColumnIndex,
    parseCutTime,
    formatCutTime,
    extractPrioritiesRows,
  };
});
