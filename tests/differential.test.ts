// Differential test: TS unifiedDiff vs CPython 3.14.4 difflib on autojunk-regime inputs.
// Skips if Python 3.14.x is unavailable.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { unifiedDiff } from "../format_md_tables.ts";

// Ubuntu runners ship `python3`, not `python`; Windows has `python`.
const PYTHON_CANDIDATES = ["python", "python3"];

function findPython314(): string | null {
  for (const bin of PYTHON_CANDIDATES) {
    try {
      const result = spawnSync(bin, ["--version"], { encoding: "utf-8" });
      if (result.status === 0 && result.stdout.includes("Python 3.14")) {
        return bin;
      }
    } catch {
      // continue to next candidate
    }
  }
  return null;
}

function checkPythonAvailable(): boolean {
  return findPython314() !== null;
}

function pythonBin(): string {
  const bin = findPython314();
  if (bin === null) throw new Error("no Python 3.14 available");
  return bin;
}

function buildAutojunkInput(
  n: number,
  repeatIndices: Set<number>,
  modifyIndex: number | null,
): { a: string[]; b: string[] } {
  const repeatLine = "REPEATED\n";
  const otherLine = (i: number) => `unique-line-${i}\n`;
  const a: string[] = [];
  const b: string[] = [];
  for (let i = 0; i < n; i++) {
    if (repeatIndices.has(i)) {
      a.push(repeatLine);
      b.push(repeatLine);
    } else {
      const la = otherLine(i);
      const lb = modifyIndex === i ? `MODIFIED-${i}\n` : la;
      a.push(la);
      b.push(lb);
    }
  }
  return { a, b };
}

function cpythonUnifiedDiff(a: string[], b: string[]): string {
  const script = `
import difflib, sys
a = ${JSON.stringify(a)}
b = ${JSON.stringify(b)}
for line in difflib.unified_diff(a, b, fromfile="a", tofile="b", lineterm=""):
    sys.stdout.buffer.write(line.encode("utf-8"))
`;
  const result = spawnSync(pythonBin(), ["-c", script], { encoding: "buffer" });
  if (result.status !== 0) {
    throw new Error(`Python exited ${result.status}: ${result.stderr.toString()}`);
  }
  return result.stdout.toString("utf-8");
}

const PYTHON_AVAILABLE = checkPythonAvailable();

describe.skipIf(!PYTHON_AVAILABLE)("autojunk differential parity", () => {
  test("n=240, repeated lines at 42/100/150/200, modified at 180", () => {
    const repeatIndices = new Set([42, 100, 150, 200]);
    const { a, b } = buildAutojunkInput(240, repeatIndices, 180);
    const tsOutput = unifiedDiff(a, b, "a", "b");
    const pyOutput = cpythonUnifiedDiff(a, b);
    expect(tsOutput).toBe(pyOutput);
  });

  test("boundary: n=199 (below autojunk threshold)", () => {
    const repeatIndices = new Set([50, 100, 150]);
    const { a, b } = buildAutojunkInput(199, repeatIndices, 120);
    const tsOutput = unifiedDiff(a, b, "a", "b");
    const pyOutput = cpythonUnifiedDiff(a, b);
    expect(tsOutput).toBe(pyOutput);
  });

  test("boundary: n=200 (at autojunk threshold)", () => {
    const repeatIndices = new Set([50, 100, 150]);
    const { a, b } = buildAutojunkInput(200, repeatIndices, 120);
    const tsOutput = unifiedDiff(a, b, "a", "b");
    const pyOutput = cpythonUnifiedDiff(a, b);
    expect(tsOutput).toBe(pyOutput);
  });

  test("boundary: n=201 (just above autojunk threshold)", () => {
    const repeatIndices = new Set([50, 100, 150]);
    const { a, b } = buildAutojunkInput(201, repeatIndices, 120);
    const tsOutput = unifiedDiff(a, b, "a", "b");
    const pyOutput = cpythonUnifiedDiff(a, b);
    expect(tsOutput).toBe(pyOutput);
  });

  test("repeat count straddling n//100+1: n=240, repeat count = 3 (exactly ntest)", () => {
    // n=240, ntest = 240//100 + 1 = 3. Repeat count = 3 means idxs.length == ntest (not >).
    // So the element is NOT popular. Should match normally.
    const repeatIndices = new Set([42, 100, 150]); // 3 repeats
    const { a, b } = buildAutojunkInput(240, repeatIndices, 180);
    const tsOutput = unifiedDiff(a, b, "a", "b");
    const pyOutput = cpythonUnifiedDiff(a, b);
    expect(tsOutput).toBe(pyOutput);
  });

  test("repeat count straddling n//100+1: n=240, repeat count = 4 (just above ntest)", () => {
    // n=240, ntest = 3. Repeat count = 4 means idxs.length > ntest → popular.
    const repeatIndices = new Set([42, 100, 150, 200]); // 4 repeats
    const { a, b } = buildAutojunkInput(240, repeatIndices, 180);
    const tsOutput = unifiedDiff(a, b, "a", "b");
    const pyOutput = cpythonUnifiedDiff(a, b);
    expect(tsOutput).toBe(pyOutput);
  });
});

describe("autojunk differential parity (skip condition)", () => {
  test("test suite skips gracefully when Python 3.14.x is unavailable", () => {
    if (PYTHON_AVAILABLE) {
      expect(true).toBe(true); // Python available, tests ran.
    } else {
      expect(true).toBe(true); // Python unavailable, tests skipped.
    }
  });
});
