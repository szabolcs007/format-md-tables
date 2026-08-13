import { collectTable, pyRstrip, pyStrip, BLOCK_START_RE, HR_RE, PREFIX_RE } from "../format_md_tables.ts";
import * as fs from "node:fs";

const text = fs.readFileSync(".work/mutant213.md", "utf-8");
const lines = text.split("\n").map((l) => l.replace(/\r+$/, ""));

const found = collectTable(lines, 59, 40, 8);
console.log("collected:", found !== null ? `end=${found.next}` : "null");

// Manually trace the row loop from j = 61
const prefix0 = "";
for (let j = 61; j < 90; j++) {
  const line = lines[j]!;
  const blank = !pyStrip(line);
  if (blank) { console.log(j, "BREAK blank"); break; }
  const m = line.match(PREFIX_RE)!;
  const body = pyRstrip(m.groups!.body);
  if (!body) { console.log(j, "BREAK empty body"); break; }
  if (BLOCK_START_RE.test(body) || HR_RE.test(body)) { console.log(j, "BREAK block_start/hr", JSON.stringify(body)); break; }
  if (2 > 1 && !body.includes("|")) { console.log(j, "BREAK no pipe"); break; }
  console.log(j, "row ok:", JSON.stringify(body));
}
