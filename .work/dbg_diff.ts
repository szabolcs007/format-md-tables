import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const PY_CLI = import.meta.dir + "/../format_md_tables.py";
const TS_CLI = import.meta.dir + "/../format_md_tables.ts";

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

// The blockquote seed: run --diff on both CLIs and compare stderr byte by byte.
const input = fs.readFileSync(import.meta.dir + "/../tests/blockquotes.md");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fmt-dbg-"));
const pA = path.join(tmp, "a.md");
const pB = path.join(tmp, "b.md");
fs.writeFileSync(pA, input);
fs.writeFileSync(pB, input);
const py = await run("python", [PY_CLI, "--diff", pA]);
const ts = await run(process.execPath, [TS_CLI, "--diff", pB]);
console.log("exit", py.code, ts.code);
const a = py.stderr;
const b = ts.stderr;
console.log("lens", a.length, b.length);
for (let i = 0; i < Math.min(a.length, b.length); i++) {
  if (a[i] !== b[i]) {
    console.log("first diff at", i);
    console.log("py:", JSON.stringify(a.slice(Math.max(0, i - 40), i + 40).toString("latin1")));
    console.log("ts:", JSON.stringify(b.slice(Math.max(0, i - 40), i + 40).toString("latin1")));
    break;
  }
}
