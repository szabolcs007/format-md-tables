// Port of the corpus runner (run_fixture + check functions, tests/run_tests.py:196-442).
// Fixtures run through the CLI black-box in a temp dir; invariants are
// asserted in-process.  Goldens are frozen: a mismatch is a bug, never
// regenerated.
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  FIXTURES,
  check_alignment,
  check_content,
  check_untouched,
  readText,
  runCli,
} from "./helpers.ts";

const fixtureDir = path.join(import.meta.dir, "..", "tests");

for (const name of FIXTURES) {
  test(`fixture ${name}`, async () => {
    const srcPath = path.join(fixtureDir, name);
    const orig = readText(srcPath);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fmt-md-tables-"));
    try {
      const work = path.join(tmp, name);
      fs.copyFileSync(srcPath, work);

      const r = await runCli([work]);
      expect(r.code).toBe(0);
      const out = readText(work);

      if (name === "must-not-touch.md") {
        expect(out).toBe(orig);
        return;
      }

      expect(out).not.toBe(orig);

      const golden = readText(path.join(fixtureDir, "expected", name + ".aligned"));
      expect(out).toBe(golden);

      check_alignment(name, out);
      check_content(name, orig, out);
      check_untouched(name, orig, out);

      // idempotency: second run byte-identical
      const r2 = await runCli([work]);
      expect(r2.code).toBe(0);
      expect(readText(work)).toBe(out);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}
