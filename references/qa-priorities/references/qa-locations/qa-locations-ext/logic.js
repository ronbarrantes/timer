(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.QALogic = factory();
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  const IGNORED_PASTE_LINES = new Set([
    "LOCATION",
    "CONTAINERS",
    "CURRENT LOCATION",
    "CONTAINER ID",
    "CONTAINER TAG",
  ]);
  const CSV_LOCATION_COLUMN = "Location";
  const XLSX_CONTAINER_TAG_COLUMN = "Container Tag";
  const XLSX_CURRENT_LOCATION_COLUMN = "Current Location";
  const XLSX_EARLIEST_CUT_TIME_COLUMN = "Earliest Cut-time";
  const XLSX_CUT_TIME_COLUMN = "Cut Time";
  const PRIORITY_CONTAINER_TAGS = new Set([
    "QA_HOLD_PICKING",
    "QA_HOLD_PUTAWAY",
    "QA_HOLD_REPLENISHMENT",
    "QA_HOLD_REWAREHOUSING",
  ]);

  function parseLines(raw) {
    return String(raw || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !IGNORED_PASTE_LINES.has(item.toUpperCase()));
  }

  function tokenize(value) {
    return (
      value
        .toUpperCase()
        .match(/[A-Z]+|\d+|[^A-Z\d]+/g)
        ?.map((chunk) => (/^\d+$/.test(chunk) ? Number(chunk) : chunk)) ?? [
        value,
      ]
    );
  }

  function sortableLocationKey(location) {
    const value = String(location ?? "");
    const idx = value.indexOf(":");
    if (idx === -1) return value;
    return value.slice(idx + 1);
  }

  function normalizeLocationKey(location) {
    return String(location || "")
      .trim()
      .toUpperCase();
  }

  function compareLocationCodes(a, b) {
    const partsA = tokenize(sortableLocationKey(a));
    const partsB = tokenize(sortableLocationKey(b));
    const max = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < max; i += 1) {
      const left = partsA[i];
      const right = partsB[i];
      if (left === undefined) return -1;
      if (right === undefined) return 1;

      if (typeof left === "number" && typeof right === "number") {
        if (left !== right) return left - right;
        continue;
      }

      const leftStr = String(left);
      const rightStr = String(right);
      const cmp = leftStr.localeCompare(rightStr);
      if (cmp !== 0) return cmp;
    }

    return 0;
  }

  function uniqueCaseInsensitive(values) {
    const seen = new Set();
    return values.filter((value) => {
      const key = value.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseGroupValues(raw) {
    if (Array.isArray(raw)) {
      return raw.map((value) => String(value).trim()).filter(Boolean);
    }

    return String(raw || "")
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function normalizeImportedLocations(values) {
    return uniqueCaseInsensitive(
      (values || []).map((value) => String(value || "").trim()).filter(Boolean),
    ).sort(compareLocationCodes);
  }

  function parseCSVRows(rawText) {
    const text = String(rawText || "");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (next === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }

      if (char === ",") {
        row.push(field);
        field = "";
        continue;
      }

      if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      if (char === "\r") {
        continue;
      }

      field += char;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    if (rows.length && rows[0].length) {
      rows[0][0] = String(rows[0][0]).replace(/^\uFEFF/, "");
    }

    return rows;
  }

  function getColumnIndex(headers, columnName) {
    return (headers || []).findIndex(
      (header) => String(header || "").trim() === columnName,
    );
  }

  function extractLocationsFromCSVText(csvText) {
    const rows = parseCSVRows(csvText);
    if (!rows.length) {
      throw new Error("CSV file is empty.");
    }

    const headers = rows[0].map((cell) => String(cell || "").trim());
    const locationIdx = getColumnIndex(headers, CSV_LOCATION_COLUMN);
    if (locationIdx === -1) {
      throw new Error(`CSV column "${CSV_LOCATION_COLUMN}" not found.`);
    }

    const values = rows.slice(1).map((row) => row[locationIdx] ?? "");
    return {
      values: normalizeImportedLocations(values),
      rowCount: Math.max(0, rows.length - 1),
    };
  }

  function extractPrioritiesFromXlsxRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Excel file is empty.");
    }

    const headers = rows[0].map((cell) => String(cell || "").trim());
    const tagIdx = getColumnIndex(headers, XLSX_CONTAINER_TAG_COLUMN);
    if (tagIdx === -1) {
      throw new Error(`Excel column "${XLSX_CONTAINER_TAG_COLUMN}" not found.`);
    }

    const locationIdx = getColumnIndex(headers, XLSX_CURRENT_LOCATION_COLUMN);
    if (locationIdx === -1) {
      throw new Error(
        `Excel column "${XLSX_CURRENT_LOCATION_COLUMN}" not found.`,
      );
    }

    const cutTimeIdx =
      getColumnIndex(headers, XLSX_EARLIEST_CUT_TIME_COLUMN) !== -1
        ? getColumnIndex(headers, XLSX_EARLIEST_CUT_TIME_COLUMN)
        : getColumnIndex(headers, XLSX_CUT_TIME_COLUMN);

    const prioritiesByLocation = new Map();
    rows.slice(1).forEach((row) => {
      const tag = String(row[tagIdx] ?? "").trim();
      if (!PRIORITY_CONTAINER_TAGS.has(tag)) return;

      const location = String(row[locationIdx] ?? "").trim();
      if (!location) return;

      const cutTime = parseCutTimeValue(
        cutTimeIdx === -1 ? undefined : row[cutTimeIdx],
      );
      const key = normalizeLocationKey(location);
      const prev = prioritiesByLocation.get(key);
      if (!prev) {
        prioritiesByLocation.set(key, { location, cutTime });
        return;
      }

      if (cutTime && (!prev.cutTime || cutTime < prev.cutTime)) {
        prioritiesByLocation.set(key, { location, cutTime });
      }
    });

    const entries = Array.from(prioritiesByLocation.values()).sort((a, b) =>
      compareLocationCodes(a.location, b.location),
    );

    return {
      values: entries.map((entry) => entry.location),
      entries,
      rowCount: Math.max(0, rows.length - 1),
    };
  }

  function parseCutTimeValue(value) {
    if (value == null || value === "") return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const excelEpochUtcMs = Date.UTC(1899, 11, 30);
      const utcMs = excelEpochUtcMs + Math.round(value * 24 * 60 * 60 * 1000);
      const date = new Date(utcMs);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    const text = String(value).trim();
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  function buildPriorityToneByLocation(
    locations,
    priorityEntries,
    now = new Date(),
    colorsMode = true,
  ) {
    const locationSet = new Set(
      (locations || []).map((loc) => normalizeLocationKey(loc)),
    );
    const toneMap = new Map();

    if (!colorsMode) {
      (priorityEntries || []).forEach((entry) => {
        const location = String(entry?.location || "").trim();
        const key = normalizeLocationKey(location);
        if (!location || !locationSet.has(key)) return;
        toneMap.set(key, "priority-yellow");
      });
      return toneMap;
    }

    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

    (priorityEntries || []).forEach((entry) => {
      const location = String(entry?.location || "").trim();
      const key = normalizeLocationKey(location);
      if (!location || !locationSet.has(key)) return;

      const cutTimeIso = entry?.cutTime;
      if (!cutTimeIso) return;
      const cutMs = new Date(cutTimeIso).getTime();
      if (Number.isNaN(cutMs) || Number.isNaN(nowMs)) return;

      const deltaMs = cutMs - nowMs;
      if (deltaMs <= 2 * 60 * 60 * 1000) {
        toneMap.set(key, "priority-red");
      } else if (deltaMs <= 5 * 60 * 60 * 1000) {
        toneMap.set(key, "priority-yellow");
      } else {
        toneMap.set(key, "priority-green");
      }
    });

    return toneMap;
  }

  function extractLetterPrefix(location) {
    const idx = location.indexOf(":");
    if (idx === -1) return "";
    const afterColon = location.slice(idx + 1);
    const match = afterColon.match(/^[A-Za-z]+/);
    return match ? match[0] : "";
  }

  function normalizeConfig(config) {
    const groups = (config?.groups || [])
      .map((group) => ({
        title: String(group.title || "").trim(),
        values: parseGroupValues(group.values),
      }))
      .filter((group) => group.title);

    return {
      groups,
      maxRows: Number.isFinite(config?.maxRows) ? Number(config.maxRows) : 20,
      columnGap: Number.isFinite(config?.columnGap)
        ? Number(config.columnGap)
        : 1,
      colorsMode: config?.colorsMode === true ? true : false,
    };
  }

  function groupLocations(locations, config) {
    const normalized = normalizeConfig(config);
    const validKeys = new Map();

    normalized.groups.forEach((group) => {
      group.values.forEach((value) => {
        const key = value.toLowerCase();
        validKeys.set(key, true);
      });
    });

    const grouped = {};
    validKeys.forEach((_, key) => {
      grouped[key] = [];
    });
    grouped.unassigned = [];

    locations.forEach((loc) => {
      const prefix = extractLetterPrefix(loc);
      if (!prefix) {
        grouped.unassigned.push(loc);
        return;
      }

      const prefixLower = prefix.toLowerCase();
      let assigned = false;

      if (validKeys.has(prefixLower)) {
        grouped[prefixLower].push(loc);
        assigned = true;
      }

      if (!assigned && prefix.length >= 1) {
        const firstLetter = prefixLower[0];
        if (validKeys.has(firstLetter)) {
          grouped[firstLetter].push(loc);
          assigned = true;
        }
      }

      if (!assigned) {
        grouped.unassigned.push(loc);
      }
    });

    return grouped;
  }

  function groupByTitle(grouped, config) {
    const normalized = normalizeConfig(config);
    const result = {};

    normalized.groups.forEach((group) => {
      result[group.title] = [];
    });
    result.unassigned = [];

    normalized.groups.forEach((group) => {
      group.values.forEach((value) => {
        const key = value.toLowerCase();
        if (grouped[key]) {
          result[group.title].push(...grouped[key]);
        }
      });
    });

    if (grouped.unassigned?.length) {
      result.unassigned.push(...grouped.unassigned);
    }

    return result;
  }

  function columnsNeeded(itemCount, maxRows) {
    if (maxRows <= 0 || itemCount === 0) return 1;
    return Math.ceil(itemCount / maxRows);
  }

  function buildOutputMatrix(titleOrder, groupedByTitle, maxRows, columnGap) {
    const groupTitles = [];

    titleOrder.forEach((title) => {
      if (groupedByTitle[title]?.length) {
        groupTitles.push(title);
      }
    });

    if (groupedByTitle.unassigned?.length) {
      groupTitles.push("unassigned");
    }

    const groupColumns = groupTitles.map((title) =>
      columnsNeeded(groupedByTitle[title].length, maxRows),
    );

    let maxRowsOverall = 0;
    groupTitles.forEach((title) => {
      const count = groupedByTitle[title].length;
      let rowsForGroup = count;
      if (maxRows > 0 && rowsForGroup > maxRows) {
        rowsForGroup = maxRows;
      }
      if (rowsForGroup > maxRowsOverall) {
        maxRowsOverall = rowsForGroup;
      }
    });

    const headers = [];
    const gapColumns = columnGap > 0 ? 1 : Math.max(0, columnGap);
    groupTitles.forEach((title, index) => {
      const cols = groupColumns[index];
      for (let c = 0; c < cols; c += 1) {
        headers.push(title);
      }
      if (index < groupTitles.length - 1) {
        for (let g = 0; g < gapColumns; g += 1) {
          headers.push("");
        }
      }
    });

    const rows = [];
    for (let row = 0; row < maxRowsOverall; row += 1) {
      const record = [];
      groupTitles.forEach((title, index) => {
        const locs = groupedByTitle[title];
        const cols = groupColumns[index];

        for (let c = 0; c < cols; c += 1) {
          let idx = row;
          if (maxRows > 0) {
            idx = c * maxRows + row;
          }
          record.push(idx < locs.length ? locs[idx] : "");
        }

        if (index < groupTitles.length - 1) {
          for (let g = 0; g < gapColumns; g += 1) {
            record.push("");
          }
        }
      });
      rows.push(record);
    }

    return {
      headers,
      rows,
      groupTitles,
      groupColumns,
      maxRowsOverall,
    };
  }

  function buildPrioritySet(locations, priorities) {
    const locationSet = new Set(locations.map((loc) => loc.toUpperCase()));
    const prioritySet = new Set();

    priorities.forEach((priority) => {
      const key = priority.toUpperCase();
      if (locationSet.has(key)) {
        prioritySet.add(key);
      }
    });

    return prioritySet;
  }

  return {
    parseLines,
    tokenize,
    compareLocationCodes,
    sortableLocationKey,
    normalizeLocationKey,
    uniqueCaseInsensitive,
    parseGroupValues,
    normalizeImportedLocations,
    parseCSVRows,
    getColumnIndex,
    extractLocationsFromCSVText,
    extractPrioritiesFromXlsxRows,
    parseCutTimeValue,
    normalizeConfig,
    extractLetterPrefix,
    groupLocations,
    groupByTitle,
    columnsNeeded,
    buildOutputMatrix,
    buildPrioritySet,
    buildPriorityToneByLocation,
  };
});
