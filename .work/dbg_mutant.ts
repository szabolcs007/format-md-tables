import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PY_CLI = import.meta.dir + "/../format_md_tables.py";
const TS_CLI = import.meta.dir + "/../format_md_tables.ts";

// Same PRNG + generator as tests/differential.ts
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

function makeMutant(seed: Buffer): Buffer {
  let text = seed.toString("utf-8");
  const ops = 1 + randInt(5);
  for (let o = 0; o < ops; o++) {
    switch (randInt(7)) {
      case 0: {
        const token = pick(TOKEN_POOL);
        const pos = randInt(text.length + 1);
        text = text.slice(0, pos) + token + text.slice(pos);
        break;
      }
      case 1: {
        const lines = text.split("\n");
        if (lines.length > 1) {
          lines.splice(randInt(lines.length), 0, lines[randInt(lines.length)]!);
          text = lines.join("\n");
        }
        break;
      }
      case 2: {
        const lines = text.split("\n");
        if (lines.length > 2) {
          lines.splice(randInt(lines.length), 1);
          text = lines.join("\n");
        }
        break;
      }
      case 3: {
        const idx = text.indexOf("\n", randInt(text.length));
        if (idx !== -1) {
          if (idx > 0 && text[idx - 1] === "\r") {
            text = text.slice(0, idx - 1) + text.slice(idx);
          } else {
            text = text.slice(0, idx) + "\r" + text.slice(idx);
          }
        }
        break;
      }
      case 4:
        if (!text.startsWith("\ufeff")) text = "\ufeff" + text;
        break;
      case 5: {
        const cut = randInt(text.length + 1);
        text = text.slice(0, cut);
        break;
      }
      default: {
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

async function run(cmd: string, args: string[], stdin?: Buffer) {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: import.meta.dir + "/..",
    stdin: stdin !== undefined ? "pipe" : "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined) {
    try { proc.stdin!.write(stdin); } catch {}
    try { proc.stdin!.end(); } catch {}
  }
  const [out, err] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).arrayBuffer(),
  ]);
  return { code: await proc.exited, stdout: Buffer.from(out), stderr: Buffer.from(err) };
}

// Reproduce mutant 213: seeds are consumed first (13), then mutants.
let input: Buffer = Buffer.alloc(0);
for (let m = 0; m <= 213; m++) {
  input = makeMutant(pick(SEEDS)[1]);
}
console.log("mutant-213 bytes:", input.length);
fs.writeFileSync(".work/mutant213.md", input);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fmt-dbg-"));
const p = path.join(tmp, "input.md");
for (const set of [
  { name: "file", args: (p: string) => [p] },
  { name: "mw20", args: (p: string) => ["--max-width", "20", p] },
]) {
  fs.writeFileSync(p, input);
  const py = await run("python", [PY_CLI, ...set.args(p)]);
  const fa = fs.readFileSync(p);
  fs.writeFileSync(p, input);
  const ts = await run(process.execPath, [TS_CLI, ...set.args(p)]);
  const fb = fs.readFileSync(p);
  console.log(`== ${set.name}: exit ${py.code}/${ts.code}, file ${fa.length}/${fb.length}`);
  if (!fa.equals(fb)) {
    const sa = fa.toString("utf-8");
    const sb = fb.toString("utf-8");
    for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
      if (sa[i] !== sb[i]) {
        console.log("file first diff at char", i);
        console.log("py:", JSON.stringify(sa.slice(Math.max(0, i - 60), i + 60)));
        console.log("ts:", JSON.stringify(sb.slice(Math.max(0, i - 60), i + 60)));
        break;
      }
    }
  }
}
