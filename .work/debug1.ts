import { findTables, renderTable } from "../format_md_tables.ts";

const wide = "x".repeat(120);
const input = "| " + wide + " | b |\n| --- | --- |\n| c | d |\n";
const tables = findTables(input.split("\n"), 40, 8);
console.log("tables:", tables.length);
for (const [, , t] of tables) {
  console.log("ncols", t.ncols, "rows", JSON.stringify(t.rows));
  console.log("header", JSON.stringify(t.header), "sep", JSON.stringify(t.sepCells));
}
if (tables.length > 0) {
  console.log("rendered:", JSON.stringify(renderTable(tables[0][2])));
}
