import { alignText } from "../format_md_tables.ts";

const wide = "x".repeat(120);
const cases: Array<[string, string]> = [
  ["leading-only", "| a | b\n| --- | ---\n| c | d\n"],
  ["neither", "a | b\n--- | ---\nc | d\n"],
  ["trailing-only", "a | b |\n--- | --- |\nc | d |\n"],
  ["both", "| a | b |\n| --- | --- |\n| c | d |\n"],
  ["single-col", "| h |\n| --- |\n| " + wide + " |\n"],
];
for (const [name, src] of cases) {
  const { text } = alignText(src);
  console.log("===", name, "===");
  console.log(JSON.stringify(text));
}
