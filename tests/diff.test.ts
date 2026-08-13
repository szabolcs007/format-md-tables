// Tests for unifiedDiff and SequenceMatcher (ticket 01: reuse safety).
import { describe, expect, test } from "bun:test";
import { SequenceMatcher, unifiedDiff } from "../format_md_tables.ts";

const LINES_A = ["a\n", "b\n", "c\n", "d\n", "e\n"];
const LINES_B = ["a\n", "B\n", "c\n", "D\n", "e\n"];

describe("SequenceMatcher reuse safety", () => {
  test("getGroupedOpcodes called twice returns identical groups", () => {
    const m = new SequenceMatcher(LINES_A, LINES_B);
    const first = m.getGroupedOpcodes(3);
    const second = m.getGroupedOpcodes(3);
    expect(second).toEqual(first);
  });

  test("getGroupedOpcodes called with different n does not corrupt a later call with the original n", () => {
    const m = new SequenceMatcher(LINES_A, LINES_B);
    const original = m.getGroupedOpcodes(3);
    m.getGroupedOpcodes(1); // side call with different window
    const again = m.getGroupedOpcodes(3);
    expect(again).toEqual(original);
  });

  test("getOpcodes after getGroupedOpcodes returns the original (unclamped) opcodes", () => {
    const m = new SequenceMatcher(LINES_A, LINES_B);
    const beforeGroup = JSON.stringify(m.getOpcodes());
    m.getGroupedOpcodes(3);
    const afterGroup = JSON.stringify(m.getOpcodes());
    expect(afterGroup).toBe(beforeGroup);
  });
});

describe("unifiedDiff idempotency", () => {
  test("unifiedDiff called twice on identical inputs returns identical bytes", () => {
    const first = unifiedDiff(LINES_A, LINES_B, "a", "b");
    const second = unifiedDiff(LINES_A, LINES_B, "a", "b");
    expect(second).toBe(first);
  });

  test("unifiedDiff basic shape: hunk header + leading/trailing context", () => {
    const out = unifiedDiff(LINES_A, LINES_B, "a", "b");
    expect(out).toContain("@@ -1,5 +1,5 @@");
    expect(out).toContain("-b");
    expect(out).toContain("+B");
    expect(out).toContain("-d");
    expect(out).toContain("+D");
  });
});
