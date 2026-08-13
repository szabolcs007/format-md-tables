// Port of test_cli (tests/run_tests.py:491-574), spawning the CLI black-box.
import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runCli } from "./helpers.ts";

const SRC = "# T\n\n| a | bb |\n| --- | --- |\n| c | d |\n";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fmt-md-tables-cli-"));
}

describe("cli", () => {
  test("--check on unaligned exits 1 and does not modify", async () => {
    const tmp = tmpdir();
    try {
      const p = path.join(tmp, "t.md");
      fs.writeFileSync(p, SRC);
      const r = await runCli(["--check", p]);
      expect(r.code).toBe(1);
      expect(fs.readFileSync(p, "utf-8")).toBe(SRC);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("align exits 0, then --check exits 0 on the aligned file", async () => {
    const tmp = tmpdir();
    try {
      const p = path.join(tmp, "t.md");
      fs.writeFileSync(p, SRC);
      const r1 = await runCli([p]);
      expect(r1.code).toBe(0);
      const r2 = await runCli(["--check", p]);
      expect(r2.code).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("--diff on aligned file exits 0", async () => {
    const tmp = tmpdir();
    try {
      const p = path.join(tmp, "t.md");
      fs.writeFileSync(p, SRC);
      await runCli([p]);
      const r = await runCli(["--diff", p]);
      expect(r.code).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("--diff on unaligned exits 1 with a diff on stderr", async () => {
    const tmp = tmpdir();
    try {
      const p = path.join(tmp, "unaligned.md");
      fs.writeFileSync(p, SRC, { encoding: "utf-8" });
      const r = await runCli(["--diff", p]);
      expect(r.code).toBe(1);
      expect(r.stderr.includes("---")).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("stdin mode output byte-equals file mode", async () => {
    const tmp = tmpdir();
    try {
      const rIn = await runCli([], Buffer.from(SRC, "utf-8"));
      const lfPath = path.join(tmp, "lf.md");
      fs.writeFileSync(lfPath, SRC, { encoding: "utf-8" }); // binary write keeps LF
      const rFile = await runCli([lfPath]);
      const fileOut = fs.readFileSync(lfPath);
      expect(rIn.code).toBe(0);
      expect(rFile.code).toBe(0);
      expect(Buffer.from(rIn.stdout).equals(fileOut)).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("--max-width 0 keeps the column wide (no wrap)", async () => {
    const wide = "# T\n\n| a | " + "x".repeat(120) + " |\n| --- | --- |\n| c | d |\n";
    const r = await runCli(["--max-width", "0"], Buffer.from(wide, "utf-8"));
    expect(r.code).toBe(0);
    expect(r.stdout.includes("| " + "x".repeat(120) + " |")).toBe(true);
  });

  test("--tab-width 4 expands tab to 4-column stop", async () => {
    const tabbed = "# T\n\n| k | v |\n| --- | --- |\n| a | b\tc |\n";
    const r = await runCli(["--tab-width", "4"], Buffer.from(tabbed, "utf-8"));
    expect(r.code).toBe(0);
    expect(r.stdout.includes("b   c")).toBe(true);
  });

  test("--tab-width 8 expands tab to 8-column stop", async () => {
    const tabbed = "# T\n\n| k | v |\n| --- | --- |\n| a | b\tc |\n";
    const r = await runCli(["--tab-width", "8"], Buffer.from(tabbed, "utf-8"));
    expect(r.code).toBe(0);
    expect(r.stdout.includes("b       c")).toBe(true);
  });

  test("missing file exits 2", async () => {
    const tmp = tmpdir();
    try {
      const r = await runCli([path.join(tmp, "missing.md")]);
      expect(r.code).toBe(2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("invalid UTF-8 exits 2", async () => {
    const tmp = tmpdir();
    try {
      const p = path.join(tmp, "bad.md");
      fs.writeFileSync(p, Buffer.from([0xff, 0xfe, 0x7c, 0x20, 0x61, 0x20, 0x7c, 0x0a]));
      const r = await runCli([p]);
      expect(r.code).toBe(2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("--version prints version and exits 0", async () => {
    const r = await runCli(["--version"]);
    expect(r.code).toBe(0);
    expect(r.stdout.toString("utf-8").trim()).toBe("format_md_tables 1.0.0");
  });

  test("unambiguous option prefixes match argparse (allow_abbrev)", async () => {
    const tmp = tmpdir();
    try {
      // --max-w 0 behaves like --max-width 0 (no wrap)
      const wide = "# T\n\n| a | " + "x".repeat(120) + " |\n| --- | --- |\n| c | d |\n";
      const r0 = await runCli(["--max-w", "0"], Buffer.from(wide, "utf-8"));
      expect(r0.code).toBe(0);
      expect(r0.stdout.includes("| " + "x".repeat(120) + " |")).toBe(true);
      // -c and --ch behave like --check
      const p = path.join(tmp, "t.md");
      fs.writeFileSync(p, SRC);
      const r1 = await runCli(["-c", p]);
      expect(r1.code).toBe(1);
      const r2 = await runCli(["--ch", p]);
      expect(r2.code).toBe(1);
      // single-dash long form
      const r3 = await runCli(["-max-width", "0"], Buffer.from(wide, "utf-8"));
      expect(r3.code).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("negative-number arguments are treated as files (argparse)", async () => {
    const tmp = tmpdir();
    try {
      const r = await runCli(["-5"]); // no such file -> exit 2
      expect(r.code).toBe(2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("flag option with an explicit value is rejected (argparse)", async () => {
    const r = await runCli(["--check=1"]);
    expect(r.code).toBe(2);
  });
});
