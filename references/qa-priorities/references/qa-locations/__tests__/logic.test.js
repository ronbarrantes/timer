const {
  parseLines,
  parseGroupValues,
  normalizeConfig,
  groupLocations,
  groupByTitle,
  buildOutputMatrix,
  buildPrioritySet,
  buildPriorityToneByLocation,
  parseCutTimeValue,
  parseCSVRows,
  normalizeImportedLocations,
  extractLocationsFromCSVText,
  extractPrioritiesFromXlsxRows,
} = require("../qa-locations-ext/logic");

describe("logic helpers", () => {
  test("parseLines trims and removes blanks", () => {
    expect(parseLines("A\n\n  B  \n")).toEqual(["A", "B"]);
  });

  test("parseLines filters known pasted headers", () => {
    expect(
      parseLines(
        "Location\nSS4:AA100\nContainer Tag\nCurrent Location\nSS4:BB200",
      ),
    ).toEqual(["SS4:AA100", "SS4:BB200"]);
  });

  test("parseGroupValues supports commas and spaces", () => {
    expect(parseGroupValues("A, B C")).toEqual(["A", "B", "C"]);
  });

  test("parseCSVRows handles quoted commas and escaped quotes", () => {
    expect(
      parseCSVRows(
        'Location,Note\n"SS4:AA100","A, B"\n"SS4:BB200","He said ""ok"""',
      ),
    ).toEqual([
      ["Location", "Note"],
      ["SS4:AA100", "A, B"],
      ["SS4:BB200", 'He said "ok"'],
    ]);
  });

  test("extractLocationsFromCSVText reads Location column and sorts unique values", () => {
    const csv = [
      "Location,Container",
      "SS4:HV253.A,1",
      "SS4:AB100.A,2",
      "SS4:HV253.A,3",
      ",4",
    ].join("\n");

    expect(extractLocationsFromCSVText(csv)).toEqual({
      values: ["SS4:AB100.A", "SS4:HV253.A"],
      rowCount: 4,
    });
  });

  test("extractPrioritiesFromXlsxRows filters supported QA_HOLD tags, dedupes locations, and keeps earliest cut time", () => {
    const rows = [
      [
        "Container Id",
        "Current Location",
        "Container Tag",
        "Earliest Cut-time",
      ],
      ["C1", "SS4:MEZ111.A", "QA_HOLD_PICKING", "2026-03-11T20:00:00.000Z"],
      ["C6", "SS4:PK200.A", "QA_HOLD_PUTAWAY", "2026-03-11T19:45:00.000Z"],
      ["C7", "SS4:RP210.A", "QA_HOLD_REPLENISHMENT", "2026-03-11T19:15:00.000Z"],
      ["C8", "SS4:RW220.A", "QA_HOLD_REWAREHOUSING", "2026-03-11T18:45:00.000Z"],
      ["C2", "SS4:TR333.A", "OTHER", "2026-03-11T22:00:00.000Z"],
      ["C3", "", "QA_HOLD_PICKING", "2026-03-11T19:00:00.000Z"],
      ["C4", "SS4:AB100.A", "QA_HOLD_PICKING", "2026-03-11T18:00:00.000Z"],
      ["C5", "SS4:MEZ111.A", "QA_HOLD_PICKING", "2026-03-11T19:30:00.000Z"],
    ];

    expect(extractPrioritiesFromXlsxRows(rows)).toEqual({
      values: [
        "SS4:AB100.A",
        "SS4:MEZ111.A",
        "SS4:PK200.A",
        "SS4:RP210.A",
        "SS4:RW220.A",
      ],
      entries: [
        { location: "SS4:AB100.A", cutTime: "2026-03-11T18:00:00.000Z" },
        { location: "SS4:MEZ111.A", cutTime: "2026-03-11T19:30:00.000Z" },
        { location: "SS4:PK200.A", cutTime: "2026-03-11T19:45:00.000Z" },
        { location: "SS4:RP210.A", cutTime: "2026-03-11T19:15:00.000Z" },
        { location: "SS4:RW220.A", cutTime: "2026-03-11T18:45:00.000Z" },
      ],
      rowCount: 8,
    });
  });

  test("parseCutTimeValue parses excel serial and display string values", () => {
    expect(parseCutTimeValue(46103.9625)).toBe("2026-03-22T23:06:00.000Z");
    expect(parseCutTimeValue("3/11/2026 10:51:00 PM")).not.toBeNull();
  });

  test("normalizeImportedLocations sorts using the segment after first colon", () => {
    const locations = ["PS2:AM112", "SS12:AB309.C"];

    expect(normalizeImportedLocations(locations)).toEqual([
      "SS12:AB309.C",
      "PS2:AM112",
    ]);
  });
});

describe("grouping rules", () => {
  const config = normalizeConfig({
    groups: [
      { title: "pallets", values: ["a", "b", "c"] },
      { title: "mnst", values: ["m", "n", "s", "t", "mez"] },
    ],
    maxRows: 2,
    columnGap: 1,
  });

  test("groupLocations matches explicit prefixes first, then first-letter fallback", () => {
    const locations = [
      "SS4:MEZ111.A",
      "SS4:TR333.A",
      "SS4:AB123.A",
      "SS2:W17.61",
    ];
    const grouped = groupLocations(locations, config);

    expect(grouped.mez).toEqual(["SS4:MEZ111.A"]);
    expect(grouped.t).toEqual(["SS4:TR333.A"]);
    expect(grouped.a).toEqual(["SS4:AB123.A"]);
    expect(grouped.unassigned).toEqual(["SS2:W17.61"]);
  });

  test("groupLocations supports explicit 2-letter keys before first-letter fallback", () => {
    const explicitConfig = normalizeConfig({
      groups: [{ title: "zones", values: ["d", "dd", "y", "yx"] }],
      maxRows: 2,
      columnGap: 1,
    });

    const locations = ["SS2:DD17.61", "SS2:YX52.10", "SS2:DX08.10"];
    const grouped = groupLocations(locations, explicitConfig);

    expect(grouped.dd).toEqual(["SS2:DD17.61"]);
    expect(grouped.yx).toEqual(["SS2:YX52.10"]);
    expect(grouped.d).toEqual(["SS2:DX08.10"]);
    expect(grouped.unassigned).toEqual([]);
  });

  test("groupByTitle maps grouped values to titles", () => {
    const locations = ["SS4:MEZ111.A", "SS4:TR333.A"];
    const grouped = groupLocations(locations, config);
    const titleGrouped = groupByTitle(grouped, config);

    expect(titleGrouped.mnst).toEqual(["SS4:TR333.A", "SS4:MEZ111.A"]);
  });
});

describe("output layout", () => {
  test("buildOutputMatrix handles spillover columns", () => {
    const matrix = buildOutputMatrix(
      ["pallets"],
      { pallets: ["L1", "L2", "L3", "L4", "L5"], unassigned: [] },
      2,
      0,
    );

    expect(matrix.headers).toEqual(["pallets", "pallets", "pallets"]);
    expect(matrix.rows).toEqual([
      ["L1", "L3", "L5"],
      ["L2", "L4", ""],
    ]);
  });

  test("buildOutputMatrix uses a single gap column when columnGap is 1 or more", () => {
    const matrix = buildOutputMatrix(
      ["pallets", "efg"],
      { pallets: ["L1", "L2"], efg: ["E1", "E2"], unassigned: [] },
      2,
      3,
    );

    expect(matrix.headers).toEqual(["pallets", "", "efg"]);
    expect(matrix.rows).toEqual([
      ["L1", "", "E1"],
      ["L2", "", "E2"],
    ]);
  });

  test("buildPrioritySet only keeps matches", () => {
    const set = buildPrioritySet(["A", "B"], ["B", "C"]);
    expect(Array.from(set)).toEqual(["B"]);
  });

  test("buildPriorityToneByLocation computes 3 urgency buckets based on now", () => {
    const now = new Date("2026-03-11T20:00:00.000Z");
    const toneMap = buildPriorityToneByLocation(
      ["A", "B", "C", "D"],
      [
        { location: "A", cutTime: "2026-03-11T20:30:00.000Z" },
        { location: "B", cutTime: "2026-03-11T23:00:00.000Z" },
        { location: "C", cutTime: "2026-03-12T05:30:00.000Z" },
        { location: "D", cutTime: "2026-03-11T19:45:00.000Z" },
      ],
      now,
    );

    expect(toneMap.get("A")).toBe("priority-red");
    expect(toneMap.get("B")).toBe("priority-yellow");
    expect(toneMap.get("C")).toBe("priority-green");
    expect(toneMap.get("D")).toBe("priority-red");
  });

  test("buildPriorityToneByLocation uses yellow for all priorities when colorsMode is off", () => {
    const toneMap = buildPriorityToneByLocation(
      ["A", "B", "C"],
      [
        { location: "A", cutTime: null },
        { location: "B", cutTime: "2026-03-11T23:00:00.000Z" },
      ],
      new Date("2026-03-11T20:00:00.000Z"),
      false,
    );

    expect(toneMap.get("A")).toBe("priority-yellow");
    expect(toneMap.get("B")).toBe("priority-yellow");
    expect(toneMap.get("C")).toBeUndefined();
  });
});
