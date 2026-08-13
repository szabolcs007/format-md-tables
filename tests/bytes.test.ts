// Port of test_bytes_and_ansi (tests/run_tests.py:444-488) calling alignBytes.
import { describe, expect, test } from "bun:test";
import { alignBytes } from "../format_md_tables.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { check_alignment, check_content } from "./helpers.ts";

const fixture = path.join(import.meta.dir, "..", "tests", "bytes-and-ansi.md");
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

describe("bytes & ansi", () => {
  test("BOM preserved, CRLF preserved unmixed, alignment and content hold, ANSI survives, idempotent", () => {
    const raw = fs.readFileSync(fixture);
    const { data, changed } = alignBytes(raw, 8);
    expect(changed).toBe(true);
    // BOM preserved
    expect(data.subarray(0, 3).equals(BOM)).toBe(true);
    // CRLF preserved, no mixed endings
    const text = data.subarray(3).toString("utf-8");
    expect(text.includes("\r\n")).toBe(true);
    expect(text.includes("\n")).toBe(true); // CRLF lines end with \n; no bare-\n lines
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
    // alignment and content still hold after decode
    check_alignment("bytes-and-ansi.md", text);
    check_content("bytes-and-ansi.md", raw.subarray(3).toString("utf-8"), text);
    // ANSI escapes survive inside cells
    expect(data.includes(Buffer.from("\x1b[31m"))).toBe(true);
    expect(data.includes(Buffer.from("\x1b[0m"))).toBe(true);
    // CRLF output idempotent on second run
    const { data: data2 } = alignBytes(data, 8);
    expect(data2.equals(data)).toBe(true);
  });

  test("no-final-newline input keeps no final newline", () => {
    const nl = "# T\n\n| a | b |\n| --- | --- |\n| c | d |";
    const { data } = alignBytes(Buffer.from(nl, "utf-8"), 8);
    expect(data[data.length - 1]).not.toBe(0x0a);
  });

  test("LF file with no BOM stays LF", () => {
    const lf = "# T\n\n| a | b |\n| --- | --- |\n| c | d |\n";
    const { data } = alignBytes(Buffer.from(lf, "utf-8"), 8);
    expect(data.includes(Buffer.from("\r\n"))).toBe(false);
  });

  test("invalid UTF-8 raises the exact error message", () => {
    expect(() => alignBytes(Buffer.from([0xff, 0xfe, 0x41]), 8))
      .toThrow("not valid UTF-8");
  });
});
