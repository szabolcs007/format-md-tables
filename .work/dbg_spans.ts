import { findTables } from "../format_md_tables.ts";
import * as fs from "node:fs";

const text = fs.readFileSync(".work/mutant213.md", "utf-8");
const lines = text.split("\n").map((l) => l.replace(/\r+$/, ""));
const spans = findTables(lines, 40, 8).map(([s, e, t]) => [s, e, t.ncols]);
console.log("TS spans:", JSON.stringify(spans));
