// Cell wrapping units against wrapCell(text, maxWidth).
import { describe, expect, test } from "bun:test";
import { displayWidth, wrapCell } from "../format_md_tables.ts";

const MAX = 40;

describe("wrapCell", () => {
  test("wraps at word boundaries with single-space joins", () => {
    const text = "aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk";
    expect(wrapCell(text, MAX)).toEqual([
      "aaa bbb ccc ddd eee fff ggg hhh iii jjj",
      "kkk",
    ]);
  });

  test("whitespace runs collapse to one space at break points", () => {
    const text = "a".repeat(10) + "     " + "b".repeat(10) + " " +
      "c".repeat(10) + " " + "d".repeat(10);
    expect(wrapCell(text, MAX)).toEqual([
      "a".repeat(10) + " " + "b".repeat(10) + " " + "c".repeat(10),
      "d".repeat(10),
    ]);
  });

  test("unbreakable token wider than max is hard-split into chunks <= max", () => {
    const chunks = wrapCell("x".repeat(120), MAX);
    expect(chunks).toEqual(["x".repeat(40), "x".repeat(40), "x".repeat(40)]);
    for (const c of chunks) expect(displayWidth(c)).toBeLessThanOrEqual(MAX);
  });

  test("CJK without spaces wraps per character", () => {
    expect(wrapCell("中".repeat(60), MAX)).toEqual([
      "中".repeat(20),
      "中".repeat(20),
      "中".repeat(20),
    ]);
  });

  test("cut prefers a trailing '.' when the cut is >= half the width", () => {
    const word = "abcdefghijklmnopqrstuvwxyz0123456789.abcdefghij";
    expect(wrapCell(word, MAX)).toEqual([
      "abcdefghijklmnopqrstuvwxyz0123456789.",
      "abcdefghij",
    ]);
  });

  test("cut prefers a '-' inside the word when the cut is >= half the width", () => {
    const word = "x".repeat(30) + "-" + "y".repeat(20);
    expect(wrapCell(word, MAX)).toEqual(["x".repeat(30) + "-", "y".repeat(20)]);
  });

  test("ANSI between words survives on both sides of the break", () => {
    const text = "word word word word word \x1b[31m word word word word word\x1b[0m";
    expect(wrapCell(text, MAX)).toEqual([
      "word word word word word \x1b[31m word word word",
      "word word\x1b[0m",
    ]);
  });

  test("ANSI inside a word does not introduce a space", () => {
    const text = "word word word word word\x1b[31mword word word word word";
    const out = wrapCell(text, MAX);
    expect(out[0]).toBe("word word word word word\x1b[31mword word word");
    expect(out.join(" ")).not.toContain(" \x1b[31m ");
  });

  test("token of exactly max width stays whole", () => {
    expect(wrapCell("x".repeat(MAX), MAX)).toEqual(["x".repeat(MAX)]);
  });

  test("degenerate all-ANSI input returns as-is", () => {
    const ansi = "\x1b[31m\x1b[0m";
    expect(wrapCell(ansi, MAX)).toEqual([ansi]);
  });

  test("text at or under max width returns a single fragment", () => {
    expect(wrapCell("short", MAX)).toEqual(["short"]);
    expect(wrapCell("x".repeat(39), MAX)).toEqual(["x".repeat(39)]);
  });
});
