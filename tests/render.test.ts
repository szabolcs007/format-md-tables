// Render + align end-to-end cases through alignText.
import { describe, expect, test } from "bun:test";
import { alignText } from "../format_md_tables.ts";

describe("alignText", () => {
  test("byte-exact case verified against the Python reference", () => {
    const input = "# T\n\n| a | bb |\n| --- | --- |\n| c | d |\n";
    const expected = "# T\n\n| a   | bb  |\n| --- | --- |\n| c   | d   |\n";
    const { text, changed } = alignText(input);
    expect(changed).toBe(true);
    expect(text).toBe(expected);
  });

  test("lead/trail styles: both", () => {
    const input = "| a | b |\n| --- | --- |\n| c | d |\n";
    const expected = "| a   | b   |\n| --- | --- |\n| c   | d   |\n";
    expect(alignText(input).text).toBe(expected);
  });

  test("lead/trail styles: leading-only", () => {
    const input = "| a | b\n| --- | ---\n| c | d\n";
    const expected = "| a   | b   \n| --- | ---\n| c   | d   \n";
    expect(alignText(input).text).toBe(expected);
  });

  test("lead/trail styles: trailing-only", () => {
    const input = "a | b |\n--- | --- |\nc | d |\n";
    const expected = "a   | b   |\n--- | --- |\nc   | d   |\n";
    expect(alignText(input).text).toBe(expected);
  });

  test("lead/trail styles: neither", () => {
    const input = "a | b\n--- | ---\nc | d\n";
    const expected = "a   | b   \n--- | ---\nc   | d   \n";
    expect(alignText(input).text).toBe(expected);
  });

  test("lead/trail styles: preserved (body normalized to header style)", () => {
    const input = "| a | b |\n| --- | --- |\nc | d\n";
    const expected = "| a   | b   |\n| --- | --- |\n| c   | d   |\n";
    expect(alignText(input).text).toBe(expected);
  });

  test("alignment markers render sized to column width", () => {
    const input =
      "| aaaaa | bbbbb | ccccc | ddddd |\n" +
      "| :--- | ---: | :---: | --- |\n" +
      "| e | f | g | h |\n";
    const expected =
      "| aaaaa | bbbbb | ccccc | ddddd |\n" +
      "| :---- | ----: | :---: | ----- |\n" +
      "| e     | f     | g     | h     |\n";
    expect(alignText(input).text).toBe(expected);
  });

  test("single-column table never wraps, even with an over-wide cell", () => {
    const wide = "x".repeat(120);
    const input = `| h |\n| --- |\n| ${wide} |\n`;
    const { text, changed } = alignText(input);
    expect(changed).toBe(true);
    const lines = text.split("\n");
    expect(lines.length).toBe(3);
    expect(lines[2]).toBe(`| ${wide} |`);
  });

  test("column 0 of a multi-column table never wraps", () => {
    const wide = "x".repeat(120);
    const input = `| ${wide} | b |\n| --- | --- |\n| c | d |\n`;
    const { text, changed } = alignText(input);
    expect(changed).toBe(true);
    expect(text.split("\n")[0]).toBe(`| ${wide} | b   |`);
  });

  test("fenced code blocks pass through unchanged", () => {
    const input = "```\n| a | b |\n| --- | --- |\n```\n";
    const { text, changed } = alignText(input);
    expect(changed).toBe(false);
    expect(text).toBe(input);
  });

  test("HTML blocks pass through unchanged", () => {
    const input = "<div>\n| a | b |\n| --- | --- |\n</div>\n";
    const { text, changed } = alignText(input);
    expect(changed).toBe(false);
    expect(text).toBe(input);
  });

  test("setext underline is not a table", () => {
    const input = "a | b\n---\n";
    const { text, changed } = alignText(input);
    expect(changed).toBe(false);
    expect(text).toBe(input);
  });

  test("paragraph with pipes passes through unchanged", () => {
    const input = "this | that\n";
    const { text, changed } = alignText(input);
    expect(changed).toBe(false);
    expect(text).toBe(input);
  });

  test("math block passes through unchanged", () => {
    const input = "$$\n| a | b |\n$$\n";
    const { text, changed } = alignText(input);
    expect(changed).toBe(false);
    expect(text).toBe(input);
  });

  test("already-aligned input reports changed=false", () => {
    const input = "# T\n\n| a   | bb  |\n| --- | --- |\n| c   | d   |\n";
    const { text, changed } = alignText(input);
    expect(changed).toBe(false);
    expect(text).toBe(input);
  });
});
