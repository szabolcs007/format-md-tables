// Parser unit tests + gallery extraction + fixture span dump.
// Span dump generated from the Python reference (find_tables) 2026-08-13.
import { describe, expect, test } from "bun:test";
import {
  displayWidth,
  findTables,
  isDelimiterRow,
  parseDelimCell,
  parseRowBody,
  splitRow,
} from "../format_md_tables.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { FIXTURES, MAX_WIDTH, extract_galleries, readText } from "./helpers.ts";

describe("splitRow", () => {
  test("backslash-escaped pipe is kept, not a delimiter", () => {
    expect(splitRow("a\\|b|c")).toEqual(["a\\|b", "c"]);
  });

  test("pipe inside a code span is not a delimiter", () => {
    expect(splitRow("`a|b`|c")).toEqual(["`a|b`", "c"]);
  });

  test("code span closes only on a same-length backtick run", () => {
    // inner single backtick does not close the `` span
    expect(splitRow("``a`b``|c")).toEqual(["``a`b``", "c"]);
  });

  test("adjacent same-length runs open and close cleanly", () => {
    expect(splitRow("`a`|`b`")).toEqual(["`a`", "`b`"]);
  });
});

describe("parseRowBody", () => {
  test("leading and trailing pipes are stripped, cells trimmed", () => {
    expect(parseRowBody("| a | b |")).toEqual({ cells: ["a", "b"], lead: true, trail: true });
  });

  test("leading-only pipe", () => {
    expect(parseRowBody("| a | b")).toEqual({ cells: ["a", "b"], lead: true, trail: false });
  });

  test("trailing-only pipe", () => {
    expect(parseRowBody("a | b |")).toEqual({ cells: ["a", "b"], lead: false, trail: true });
  });

  test("no pipes", () => {
    expect(parseRowBody("a | b")).toEqual({ cells: ["a", "b"], lead: false, trail: false });
  });

  test("empty first cell is a continuation candidate", () => {
    expect(parseRowBody("| | x |")).toEqual({ cells: ["", "x"], lead: true, trail: true });
  });
});

describe("parseDelimCell", () => {
  test("all four alignment forms", () => {
    expect(parseDelimCell(":---:")).toBe("c");
    expect(parseDelimCell(":---")).toBe("l");
    expect(parseDelimCell("---:")).toBe("r");
    expect(parseDelimCell("---")).toBe("n");
    expect(parseDelimCell("-")).toBe("n");
  });

  test("non-delimiter cells are null", () => {
    expect(parseDelimCell("--x")).toBeNull();
    expect(parseDelimCell("")).toBeNull();
    expect(parseDelimCell(":")).toBeNull();
    expect(parseDelimCell(":-- :")).toBeNull();
  });
});

describe("isDelimiterRow", () => {
  test("bare --- without a pipe is NOT a delimiter row", () => {
    expect(isDelimiterRow("---")).toBe(false);
  });

  test("pipe-containing dash rows are delimiter rows", () => {
    expect(isDelimiterRow("| --- | --- |")).toBe(true);
    expect(isDelimiterRow(":--- | ---:")).toBe(true);
  });

  test("a row with a non-dash cell is not a delimiter row", () => {
    expect(isDelimiterRow("| --- | x |")).toBe(false);
  });
});

describe("findTables", () => {
  test("header/delimiter cell-count mismatch is NOT a table", () => {
    expect(findTables(["| a | b | c |", "| --- | --- |"], MAX_WIDTH, 8)).toEqual([]);
  });

  test("a bare --- under a pipe row is not a table (setext)", () => {
    expect(findTables(["a | b", "---"], MAX_WIDTH, 8)).toEqual([]);
  });

  test("blockquote-prefixed tables are collected with prefix preserved", () => {
    const tables = findTables(["> | a | b |", "> | --- | --- |", "> | c | d |"], MAX_WIDTH, 8);
    expect(tables.length).toBe(1);
    expect(tables[0][2].prefix).toBe("> ");
  });

  test("table inside a fenced code block is not collected", () => {
    const lines = ["```", "| a | b |", "| --- | --- |", "```"];
    expect(findTables(lines, MAX_WIDTH, 8)).toEqual([]);
  });

  test("table inside a math block is not collected", () => {
    const lines = ["$$", "| a | b |", "| --- | --- |", "$$"];
    expect(findTables(lines, MAX_WIDTH, 8)).toEqual([]);
  });

  test("table inside an HTML block is not collected", () => {
    const lines = ["<div>", "| a | b |", "| --- | --- |", "</div>"];
    expect(findTables(lines, MAX_WIDTH, 8)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gallery extraction: fixture tables that name a "Display width" column are
// ground truth for displayWidth.
// ---------------------------------------------------------------------------

describe("gallery extraction", () => {
  const fixtureDir = import.meta.dir + "/..";
  for (const name of FIXTURES) {
    test(`galleries in ${name} match displayWidth`, () => {
      const text = readText(path.join(fixtureDir, "tests", name));
      const galleries = extract_galleries(text);
      if (galleries.length === 0) return; // no gallery tables (skipped)
      for (const [token, expected] of galleries) {
        const got = displayWidth(token);
        if (got !== expected) {
          throw new Error(
            `gallery_${name}: ${JSON.stringify(token)} -> ${got}, fixture states ${expected}`);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Span dump: (file, start, end, ncols, aligns) per fixture, from the Python
// reference.  If the TS spans disagree -> TS bug.
// ---------------------------------------------------------------------------

const SPANS: Record<string, Array<[number, number, number, string[]]>> = {
  "table-at-top.md": [[0, 4, 2, ["n", "n"]]],
  "unicode-width.md": [
    [8, 20, 3, ["n", "n", "n"]],
    [25, 40, 3, ["n", "n", "n"]],
    [45, 54, 3, ["n", "n", "n"]],
    [59, 87, 2, ["n", "n"]],
    [92, 102, 4, ["n", "n", "n", "n"]],
    [107, 122, 3, ["n", "n", "n"]],
    [127, 135, 3, ["n", "n", "n"]],
    [140, 145, 3, ["n", "n", "n"]],
    [146, 151, 3, ["l", "c", "r"]],
    [156, 161, 1, ["n"]],
  ],
  "emoji-hell.md": [
    [8, 22, 2, ["n", "n"]],
    [27, 38, 2, ["n", "n"]],
    [43, 53, 2, ["n", "n"]],
    [58, 73, 2, ["n", "n"]],
    [78, 92, 2, ["n", "n"]],
    [97, 113, 2, ["n", "n"]],
    [118, 123, 1, ["n"]],
  ],
  "wrapping.md": [
    [15, 23, 2, ["n", "n"]],
    [29, 34, 2, ["n", "n"]],
    [40, 45, 2, ["n", "n"]],
    [52, 58, 2, ["n", "n"]],
    [66, 71, 3, ["n", "n", "n"]],
    [77, 82, 3, ["n", "n", "n"]],
    [88, 92, 2, ["n", "n"]],
    [98, 103, 2, ["n", "n"]],
    [111, 117, 2, ["n", "n"]],
    [124, 135, 2, ["n", "n"]],
  ],
  "structure-edge-cases.md": [
    [12, 16, 2, ["n", "n"]],
    [23, 28, 2, ["n", "n"]],
    [36, 40, 2, ["n", "n"]],
    [47, 51, 4, ["l", "c", "r", "n"]],
    [52, 55, 1, ["n"]],
    [56, 59, 2, ["c", "n"]],
    [65, 69, 3, ["n", "n", "n"]],
    [70, 74, 2, ["l", "r"]],
    [80, 85, 3, ["n", "n", "n"]],
    [91, 95, 2, ["n", "n"]],
    [101, 105, 1, ["n"]],
    [111, 118, 2, ["n", "n"]],
    [139, 143, 2, ["n", "n"]],
    [150, 153, 2, ["n", "n"]],
    [159, 163, 4, ["n", "n", "n", "n"]],
    [
      169, 172, 24,
      ["n", "n", "n", "n", "n", "n", "n", "n", "n", "n", "n", "n",
       "n", "n", "n", "n", "n", "n", "n", "n", "n", "n", "n", "n"],
    ],
    [177, 191, 2, ["n", "n"]],
    [220, 223, 2, ["n", "n"]],
    [229, 232, 2, ["n", "n"]],
    [237, 240, 2, ["n", "n"]],
  ],
  "blockquotes.md": [
    [11, 15, 2, ["n", "n"]],
    [20, 23, 2, ["n", "n"]],
    [30, 34, 2, ["n", "n"]],
    [39, 42, 2, ["n", "n"]],
    [43, 46, 2, ["n", "n"]],
    [52, 55, 2, ["n", "n"]],
    [62, 65, 2, ["n", "n"]],
    [70, 73, 2, ["n", "n"]],
    [79, 82, 2, ["n", "n"]],
    [83, 86, 2, ["n", "n"]],
    [95, 98, 2, ["n", "n"]],
    [99, 102, 2, ["n", "n"]],
    [110, 113, 2, ["n", "n"]],
  ],
  "must-not-touch.md": [],
  "preserve.md": [
    [8, 13, 3, ["l", "c", "r"]],
    [20, 24, 2, ["l", "r"]],
    [31, 36, 3, ["l", "r", "l"]],
    [44, 48, 2, ["l", "r"]],
    [54, 59, 2, ["n", "n"]],
    [74, 79, 3, ["l", "l", "l"]],
    [86, 91, 2, ["n", "n"]],
    [101, 104, 3, ["l", "l", "l"]],
    [113, 116, 2, ["l", "r"]],
    [125, 128, 2, ["n", "r"]],
  ],
  "bytes-and-ansi.md": [
    [11, 17, 2, ["n", "n"]],
    [24, 27, 2, ["n", "n"]],
    [32, 35, 2, ["n", "n"]],
    [36, 39, 2, ["n", "n"]],
  ],
};

describe("fixture span dump matches Python reference", () => {
  const fixtureDir = import.meta.dir + "/..";
  for (const name of FIXTURES) {
    test(`spans of ${name}`, () => {
      const text = readText(path.join(fixtureDir, "tests", name));
      const got = findTables(text.split("\n"), MAX_WIDTH, 8).map(
        ([s, e, t]) => [s, e, t.ncols, t.aligns],
      );
      expect(got).toEqual(SPANS[name]);
    });
  }
});
