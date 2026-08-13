// Differential parity gate (dev-only; deleted at cutover).
//
// Runs the Python CLI and the TS CLI side by side over the fixture corpus
// plus deterministic seeded mutants, comparing stdout bytes, stderr bytes,
// exit codes, and resulting file bytes for every argument set.  Any
// difference is a port bug.
//
// Each (input, arg set) pair runs on its own fresh temp copy; both CLIs run
// against the SAME path, with the pristine input rewritten before each run
// so in-place runs see identical bytes.
//
// Usage: bun tests/differential.ts [mutantCount]
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PY_CLI = import.meta.dir + "/../format_md_tables.py";
const TS_CLI = import.meta.dir + "/../format_md_tables.ts";
const CONCURRENCY = 8;
const PER_PROCESS_TIMEOUT_MS = 60_000;

// Deterministic PRNG so the sweep is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0xc0ffee);
const randInt = (n: number): number => Math.floor(rand() * n);
const pick = <T>(arr: T[]): T => arr[randInt(arr.length)]!;

const TOKEN_POOL = [
  "中", "文", "字", "！", "Ａ", "한", "ᄀ", "─", "→", "✂", "➜",
  "👨‍👩‍👧‍👦", "🇭🇺", "🇭", "👍🏽", "1️⃣", "⭐", "⭐️", "☀", "☀️", "⭐︎",
  "\x1b[31m", "\x1b[0m", "\x1b[1m", "\x1b[38;5;196m", "\x1b]0;t\x07",
  "\t", " ", "a", "b", "|", "\\|", "`", "```", "---", ":---", "> ",
  "\u0301", "\u200b", "\u2060", "\ufeff", "\u200d", "‍😀", "e\u0301",
];

// Seed pool: the 9 fixtures + 4 small hand seeds.
const SEEDS: Array<[string, Buffer]> = [];
const fixtureDir = import.meta.dir + "/..";
for (const name of [
  "table-at-top.md", "unicode-width.md", "emoji-hell.md", "wrapping.md",
  "structure-edge-cases.md", "blockquotes.md", "must-not-touch.md",
  "preserve.md", "bytes-and-ansi.md",
]) {
  SEEDS.push([name, fs.readFileSync(path.join(fixtureDir, "tests", name))]);
}
SEEDS.push(["plain", Buffer.from("| a | b |\n| --- | --- |\n| c | d |\n", "utf-8")]);
SEEDS.push(["cjk", Buffer.from("| 中文 | z |\n| --- | --- |\n| 汉字 | w |\n", "utf-8")]);
SEEDS.push([
  "ansi",
  Buffer.from("| a | \x1b[31mred\x1b[0m |\n| --- | --- |\n| c | d |\n", "utf-8"),
]);
SEEDS.push([
  "blockquote",
  Buffer.from("> | a | b |\n> | --- | --- |\n> | c | d |\n", "utf-8"),
]);

/** Apply 1-5 random mutation ops to a seed. */
function makeMutant(seed: Buffer): Buffer {
  let text = seed.toString("utf-8");
  const ops = 1 + randInt(5);
  for (let o = 0; o < ops; o++) {
    switch (randInt(7)) {
      case 0: { // insert a random token at a random position
        const token = pick(TOKEN_POOL);
        const pos = randInt(text.length + 1);
        text = text.slice(0, pos) + token + text.slice(pos);
        break;
      }
      case 1: { // duplicate a random line
        const lines = text.split("\n");
        if (lines.length > 1) {
          lines.splice(randInt(lines.length), 0, lines[randInt(lines.length)]!);
          text = lines.join("\n");
        }
        break;
      }
      case 2: { // delete a random line
        const lines = text.split("\n");
        if (lines.length > 2) {
          lines.splice(randInt(lines.length), 1);
          text = lines.join("\n");
        }
        break;
      }
      case 3: { // flip a random \n <-> \r\n
        const idx = text.indexOf("\n", randInt(text.length));
        if (idx !== -1) {
          if (idx > 0 && text[idx - 1] === "\r") {
            text = text.slice(0, idx - 1) + text.slice(idx); // \r\n -> \n
          } else {
            text = text.slice(0, idx) + "\r" + text.slice(idx); // \n -> \r\n
          }
        }
        break;
      }
      case 4: // prepend BOM
        if (!text.startsWith("\ufeff")) text = "\ufeff" + text;
        break;
      case 5: { // truncate at a random offset
        const cut = randInt(text.length + 1);
        text = text.slice(0, cut);
        break;
      }
      default: { // wrap a random line range in a fenced code block
        const lines = text.split("\n");
        const a = randInt(lines.length);
        const b = a + randInt(lines.length - a);
        lines.splice(b, 0, "```");
        lines.splice(a, 0, "```");
        text = lines.join("\n");
        break;
      }
    }
  }
  return Buffer.from(text, "utf-8");
}

interface RunResult {
  code: number;
  stdout: Buffer;
  stderr: Buffer;
}

async function run(cmd: string, args: string[], stdin?: Buffer): Promise<RunResult> {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: import.meta.dir + "/..",
    stdin: stdin !== undefined ? "pipe" : "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined) {
    try {
      proc.stdin!.write(stdin);
    } catch {
      // child may exit early; ignore
    }
    try {
      proc.stdin!.end();
    } catch {
      // already closed
    }
  }
  const pipes = Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).arrayBuffer(),
  ]);
  const timer = new Promise<never>((_, reject) => {
    setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // already gone
      }
      reject(new Error(`process timed out: ${cmd} ${args.join(" ")}`));
    }, PER_PROCESS_TIMEOUT_MS).unref();
  });
  const [out, err, code] = await Promise.race([
    (async () => {
      const [o, e] = await pipes;
      const c = await proc.exited;
      return [o, e, c] as const;
    })(),
    timer,
  ]);
  return { code, stdout: Buffer.from(out), stderr: Buffer.from(err) };
}

const ARG_SETS: Array<{
  name: string;
  args: (p: string) => string[];
  stdin: boolean;
}> = [
  { name: "stdin", args: () => [], stdin: true },
  { name: "file", args: (p) => [p], stdin: false },
  { name: "check", args: (p) => ["--check", p], stdin: false },
  { name: "diff", args: (p) => ["--diff", p], stdin: false },
  { name: "mw20", args: (p) => ["--max-width", "20", p], stdin: false },
];

let diffs = 0;
let cases = 0;
let diffLog: string[] = [];

function compare(
  label: string,
  set: string,
  py: RunResult,
  ts: RunResult,
  files: [Buffer, Buffer] | null,
  input: Buffer,
): void {
  cases++;
  const fail = (what: string): void => {
    diffs++;
    diffLog.push(`DIFF [${label}] ${set}: ${what}`);
    console.log(`DIFF [${label}] ${set}: ${what}`);
  };
  if (!py.stdout.equals(ts.stdout)) {
    fail(`stdout bytes differ (${py.stdout.length} vs ${ts.stdout.length})`);
  }
  if (!py.stderr.equals(ts.stderr)) {
    fail(`stderr bytes differ (${py.stderr.length} vs ${ts.stderr.length})`);
  }
  if (py.code !== ts.code) {
    fail(`exit code ${py.code} vs ${ts.code}`);
  }
  if (files !== null) {
    if (!files[0].equals(files[1])) {
      fail(`resulting file bytes differ (${files[0].length} vs ${files[1].length})`);
    }
    if (set === "check" || set === "diff") {
      if (!files[0].equals(input)) fail("file modified by check/diff (python)");
      if (!files[1].equals(input)) fail("file modified by check/diff (ts)");
    }
  }
}

/** One (input, arg set) pair: both CLIs against the same fresh path. */
async function checkPair(
  label: string,
  setName: string,
  input: Buffer,
): Promise<void> {
  const set = ARG_SETS.find((s) => s.name === setName)!;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fmt-diff-"));
  try {
    if (set.stdin) {
      const py = await run("python", [PY_CLI], input);
      const ts = await run(process.execPath, [TS_CLI], input);
      compare(label, setName, py, ts, null, input);
    } else {
      const p = path.join(tmp, "input.md");
      fs.writeFileSync(p, input);
      const py = await run("python", [PY_CLI, ...set.args(p)]);
      const fileAfterPy = fs.readFileSync(p);

      fs.writeFileSync(p, input);
      const ts = await run(process.execPath, [TS_CLI, ...set.args(p)]);
      const fileAfterTs = fs.readFileSync(p);

      compare(label, setName, py, ts, [fileAfterPy, fileAfterTs], input);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  // Python availability: skip the gate (with a note) if absent.
  try {
    const probe = await run("python", ["--version"]);
    if (probe.code !== 0) throw new Error("python --version failed");
  } catch {
    console.log("differential gate SKIPPED: python not found on PATH");
    return;
  }

  const mutantCount =
    process.argv[2] !== undefined ? parseInt(process.argv[2]!, 10) : 300;
  const inputs: Array<{ label: string; input: Buffer }> = [];
  for (const [name, seed] of SEEDS) {
    inputs.push({ label: `seed:${name}`, input: seed });
  }
  for (let m = 0; m < mutantCount; m++) {
    inputs.push({ label: `mutant-${m}`, input: makeMutant(pick(SEEDS)[1]) });
  }

  // Flat (input, arg set) task list — deterministic order of inputs and sets.
  interface Task {
    label: string;
    setName: string;
    input: Buffer;
  }
  const tasks: Task[] = [];
  for (const { label, input } of inputs) {
    for (const set of ARG_SETS) {
      tasks.push({ label, setName: set.name, input });
    }
  }

  const startedAt = Date.now();
  let next = 0;
  let completed = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= tasks.length) return;
      const t = tasks[idx]!;
      try {
        await checkPair(t.label, t.setName, t.input);
      } catch (e) {
        diffs++;
        diffLog.push(`DIFF [${t.label}] ${t.setName}: harness error: ${(e as Error).message}`);
        console.log(`DIFF [${t.label}] ${t.setName}: harness error: ${(e as Error).message}`);
      }
      completed++;
      if (completed % 50 === 0 || completed === tasks.length) {
        const secs = Math.round((Date.now() - startedAt) / 1000);
        console.log(`progress ${completed}/${tasks.length} (${secs}s, ${diffs} diffs)`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`differential gate: ${cases} comparisons, ${diffs} diffs`);
  if (diffs > 0) {
    console.log("diff details:");
    for (const d of diffLog) console.log("  " + d);
  }
  process.exit(diffs > 0 ? 1 : 0);
}

await main();
