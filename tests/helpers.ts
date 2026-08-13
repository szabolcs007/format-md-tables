// Shared test-support helpers for the format-md-tables TS port.
// Faithful ports of the Python harness helpers (tests/run_tests.py).
import * as A from "../format_md_tables.ts";
import * as fs from "node:fs";

export const MAX_WIDTH = 40;

export const FIXTURES = [
  "table-at-top.md",
  "unicode-width.md",
  "emoji-hell.md",
  "wrapping.md",
  "structure-edge-cases.md",
  "blockquotes.md",
  "must-not-touch.md",
  "preserve.md",
  "bytes-and-ansi.md",
];

export const GALLERY_HEADERS: Record<string, true> = {
  token: true,
  glyph: true,
  cell: true,
  string: true,
  text: true,
  sequence: true,
  item: true,
};

/** Python text-mode read: universal newlines normalize CRLF -> LF. */
export function readText(p: string): string {
  return fs.readFileSync(p, "utf-8").replace(/\r\n/g, "\n");
}

/** Spawn the TS CLI black-box (Python: subprocess.run([sys.executable, ALIGNER, ...])). */
export async function runCli(
  args: string[],
  stdin?: Uint8Array,
  cwd?: string,
): Promise<{ code: number; stdout: Buffer; stderr: Buffer }> {
  const script = import.meta.dir + "/../format_md_tables.ts";
  const proc = Bun.spawn([process.execPath, script, ...args], {
    cwd: cwd ?? import.meta.dir + "/..",
    stdin: stdin !== undefined ? "pipe" : "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined) {
    try {
      proc.stdin!.write(stdin);
    } catch {
      // child may exit early on usage errors; ignore
    }
    try {
      proc.stdin!.end();
    } catch {
      // already closed
    }
  }
  const [out, err] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).arrayBuffer(),
  ]);
  const code = await proc.exited;
  return { code, stdout: Buffer.from(out), stderr: Buffer.from(err) };
}

export function pipe_columns(body: string): number[] {
  const b = body.replace(A.ANSI_RE, "");
  const chars = Array.from(b);
  const pipes: number[] = [];
  let i = 0;
  const n = chars.length;
  let in_backticks = false;
  let backtick_count = 0;
  while (i < n) {
    const c = chars[i];
    if (c === "`") {
      let j = i;
      while (j < n && chars[j] === "`") j++;
      const count = j - i;
      if (!in_backticks) {
        in_backticks = true;
        backtick_count = count;
      } else if (count === backtick_count) {
        in_backticks = false;
        backtick_count = 0;
      }
      i = j;
      continue;
    }
    if (in_backticks) {
      i++;
      continue;
    }
    if (c === "\\" && i + 1 < n) {
      i += 2;
      continue;
    }
    if (c === "|") {
      pipes.push(i);
    }
    i++;
  }
  return pipes.map((idx) => A.displayWidth(chars.slice(0, idx).join("")));
}

export function check_alignment(name: string, outText: string): void {
  const lines = outText.split("\n");
  for (const [start, end, t] of A.findTables(lines, MAX_WIDTH, 8)) {
    const block = lines.slice(start, end);
    let refPipes: number[] | null = null;
    let refWidth: number | null = null;
    for (const ln of block) {
      const m = ln.match(A.PREFIX_RE);
      const body = m && m.groups ? m.groups.body : ln;
      const pipes = pipe_columns(body);
      const total = A.displayWidth(body);
      if (refPipes === null) {
        refPipes = pipes;
        refWidth = total;
        continue;
      }
      if (pipes.join(",") !== refPipes.join(",")) {
        throw new Error(
          `alignment_${name}: line ${JSON.stringify(ln)} pipes ${pipes} != ${refPipes}`);
      }
      if (total !== refWidth) {
        throw new Error(
          `alignment_${name}: line ${JSON.stringify(ln)} width ${total} != ${refWidth}`);
      }
    }
  }
}

export function check_width_caps(name: string, outText: string): void {
  const lines = outText.split("\n");
  for (const [, , t] of A.findTables(lines, MAX_WIDTH, 8)) {
    if (t.ncols <= 1) continue; // single-column tables never wrap
    const widths = t.header.map((c) => Math.max(3, A.displayWidth(c.join(" "))));
    for (const row of t.rows) {
      for (let j = 0; j < row.cells.length; j++) {
        const joined = A.displayWidth(row.cells[j].join(" "));
        if (j < widths.length) widths[j] = Math.max(widths[j], joined);
      }
    }
    if (MAX_WIDTH) {
      for (let j = 0; j < widths.length; j++) {
        if (j !== 0) widths[j] = Math.min(widths[j], MAX_WIDTH);
      }
    }
    for (const row of t.rows) {
      for (let j = 0; j < row.cells.length; j++) {
        for (const frag of row.cells[j]) {
          if (A.displayWidth(frag) > widths[j]) {
            throw new Error(
              `width_caps_${name}: fragment ${JSON.stringify(frag)} (${A.displayWidth(frag)}) wider than column ${j}`);
          }
        }
      }
    }
  }
}

export function norm_cell(s: string): string {
  return s.replace(/\s+/g, "");
}

export function table_snapshot(text: string): Array<{
  ncols: number;
  aligns: string[];
  header: string[];
  rows: string[][];
}> {
  const snap = [];
  for (const [, , t] of A.findTables(text.split("\n"), MAX_WIDTH, 8)) {
    snap.push({
      ncols: t.ncols,
      aligns: t.aligns,
      header: t.header.map((c) => norm_cell(c.join(" "))),
      rows: t.rows.map((row) => row.cells.map((c) => norm_cell(c.join(" ")))),
    });
  }
  return snap;
}

export function check_content(name: string, orig: string, out: string): void {
  const a = table_snapshot(orig);
  const b = table_snapshot(out);
  if (a.length !== b.length) {
    throw new Error(`content_${name}: table count ${a.length} -> ${b.length}`);
  }
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      throw new Error(
        `content_${name}: table ${i} differs:\n  input : ${JSON.stringify(a[i])}\n  output: ${JSON.stringify(b[i])}`);
    }
  }
}

export function check_untouched(name: string, orig: string, out: string): void {
  const origLines = orig.split("\n");
  const outLines = out.split("\n");
  const tableRanges = A.findTables(origLines, MAX_WIDTH, 8).map(([s, e]) => [s, e]);
  let p = 0;
  for (let i = 0; i < origLines.length; i++) {
    if (tableRanges.some(([s, e]) => s <= i && i < e)) continue;
    const idx = outLines.indexOf(origLines[i], p);
    if (idx === -1) {
      throw new Error(
        `untouched_${name}: original non-table line ${i + 1} ${JSON.stringify(origLines[i])} missing/moved in output`);
    }
    p = idx;
  }
}

export function check_wrapped(name: string, outText: string): void {
  const lines = outText.split("\n");
  for (const [, , t] of A.findTables(lines, MAX_WIDTH, 8)) {
    for (const row of t.rows) {
      if (row.cells.some((frags) => frags.length > 1)) return;
    }
  }
  throw new Error(`wrapped_${name}: no multi-line rows produced`);
}

export function extract_galleries(text: string): Array<[string, number]> {
  const lines = text.split("\n");
  const galleries: Array<[string, number]> = [];
  for (const [, , t] of A.findTables(lines, MAX_WIDTH, 8)) {
    const header = t.header.map((c) => c.join(" "));
    let wcol = -1;
    for (let i = 0; i < header.length; i++) {
      if (header[i].toLowerCase() === "display width") {
        wcol = i;
        break;
      }
    }
    if (wcol === -1) continue;
    const tcol = header[0].toLowerCase() === "script" ? 1 : 0;
    if (tcol === wcol) continue;
    for (const row of t.rows) {
      const cells = row.cells.map((c) => c.join(" "));
      if (cells.length <= Math.max(tcol, wcol)) continue;
      const token = A.pyStrip(cells[tcol]);
      const raw = A.pyStrip(cells[wcol]);
      if (!/^\d+$/.test(raw)) continue;
      galleries.push([token, parseInt(raw, 10)]);
    }
  }
  return galleries;
}
