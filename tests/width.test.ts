// Width-model ground truth, transcribed verbatim from tests/run_tests.py:83-131.
import { describe, expect, test } from "bun:test";
import { displayWidth } from "../format_md_tables.ts";

const WIDTH_CASES: Array<[string, number]> = [
  ["👨‍👩‍👧‍👦", 2], // ZWJ family
  ["👨‍👩‍👧‍👦👨‍👩‍👧‍👦", 4],
  ["🇭🇺", 2], // flag pair
  ["🇭", 2], // lone regional indicator
  ["👍🏽", 2], // base + skin tone
  ["🧑🏿‍🦰", 2], // skin tone + ZWJ + hair
  ["1️⃣", 2], // keycap
  ["⭐", 2], // emoji presentation
  ["⭐️", 2],
  ["☀", 1], // text presentation
  ["☀️", 2], // VS16 promotes to emoji
  ["⭐︎", 1], // VS15 demotes emoji-default to text presentation
  ["☀︎", 1], // VS15 on text-default stays 1
  ["1️⃣︎", 2], // keycap beats trailing VS15
  ["‍😀", 2], // standalone ZWJ + emoji: emoji keeps width 2
  ["‍​", 0], // ZWJ + ZWSP: both zero-width
  ["‍́", 0], // ZWJ + combining acute: zero-width
  ["‍‍‍", 0], // bare ZWJ run
  ["🇭🇺🇩🇪", 4], // two flags: 4
  ["e\u0301", 1], // combining acute
  ["e\u0301\u0302", 1],
  ["\u200b", 0], // ZWSP
  ["\u2060", 0], // word joiner
  ["\u00ad", 0], // soft hyphen
  ["\ufeff", 0], // BOM
  ["\u200d", 0], // ZWJ
  ["\ufe0f", 0], // VS16 alone
  ["中文", 4],
  ["Ａ", 2], // fullwidth
  ["ｶ", 1], // halfwidth katakana
  ["한", 2],
  ["ᄀ", 2], // jamo leading consonant
  ["ᅡ", 1], // jamo vowel
  ["！", 2],
  ["─", 1], // box drawing (ambiguous -> 1)
  ["│", 1],
  ["→", 1], // arrow (ambiguous -> 1)
  ["✂", 1],
  ["➜", 1],
  ["𝐀", 1], // math alphanumeric (EAW=N)
  ["𝄞", 1], // musical symbol (EAW=N)
  ["𠀀", 2], // CJK ext B
  ["नमस्ते", 4], // devanagari (virama is Mn -> 0)
  ["्", 0],
  ["\x1b[31mred\x1b[0m", 3], // ANSI is zero width
  ["\t", 8], // lone tab -> one stop of 8
  ["a\tb", 9], // a(1) + tab->7 + b(1) = 9
];

describe("width model ground truth", () => {
  for (const [token, expected] of WIDTH_CASES) {
    test(`width ${JSON.stringify(token)} == ${expected}`, () => {
      expect(displayWidth(token)).toBe(expected);
    });
  }
});
