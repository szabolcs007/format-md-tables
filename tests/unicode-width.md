# Unicode display-width torture tests

*This fixture drives the width engine of `align_md_tables.py`. Each section pins down one width class: East Asian Width (wide / fullwidth / halfwidth), combining marks, zero-width characters, astral-plane glyphs, and terminal lookalikes. The aligner MUST recompute every cell below at the stated display width and MUST NOT alter a single codepoint. Literal ESC bytes, CRLF line endings, and BOM-bearing files are handled by the orchestrator and intentionally do not appear here.*

## 1. CJK ideographs and fullwidth forms

*Ideographs, fullwidth alphanumerics, and fullwidth punctuation are 2 columns each; halfwidth katakana are 1; Hangul syllables are 2. Isolated Jamo split unevenly: leading consonants (U+1100..U+115F) are wide, medial/vowel and trailing consonants (U+1160..U+11FF) are narrow. The width engine must never fall back to UTF-8 byte counts — 中文测试 is 12 bytes but only 8 columns.*

| Script | Sample | Display width |
| --- | --- | --- |
| Simplified Chinese | 中文测试 | 8 |
| Traditional Chinese | 繁體中文測試 | 12 |
| Fullwidth alphanumerics | ＡＢＣ１２３ | 12 |
| Halfwidth katakana | ｶﾀｶﾅ | 4 |
| Hangul syllables | 한글조합 | 8 |
| Hangul with spaces | 한국어 는 아름답다 | 18 |
| Isolated Jamo | ᄀ ᅡ ᆨ | 6 |
| Fullwidth punctuation | ，。！？ | 8 |
| CJK + latin mixed | カタカナと漢字とABC | 19 |
| Latin + fullwidth mixed | width１２３ | 11 |

## 2. Combining marks and complex scripts

*Base and syllabic letters are 1 column; every combining mark — accents, matras, virama, nukta, shadda, niqqud, tone marks, vowel signs — adds 0. The aligner must count clusters without ever splitting or reordering the stack, and wrapping must keep every cluster intact.*

| Script | Sample | Display width |
| --- | --- | --- |
| Latin + combining acute | é | 1 |
| Latin + combining ring | e̊ | 1 |
| Latin + double accent | ế | 1 |
| Devanagari | नमस्ते | 4 |
| Devanagari + nukta | फ़ | 1 |
| Devanagari sentence | हिन्दी में नमस्ते | 10 |
| Arabic | مرحبا | 5 |
| Arabic + diacritics | شَدَّة | 3 |
| Hebrew | שלום | 4 |
| Hebrew + niqqud | שָׁלוֹם | 4 |
| Thai | สวัสดี | 4 |
| Thai + tone marks | ไม้ | 2 |
| Vietnamese | tiếng Việt | 10 |

## 3. Zero-width characters

*ZWSP (U+200B), word joiner (U+2060), soft hyphen (U+00AD), BOM (U+FEFF), and zero-width joiner (U+200D) all occupy 0 columns. They are still content: the aligner must neither count them nor merge or delete the letters around them, and a soft hyphen must never become a wrap point.*

| Cell | Contains | Display width |
| --- | --- | --- |
| a​b | ZWSP between letters | 2 |
| a⁠b | word joiner between letters | 2 |
| ad­jacent | soft hyphen inside a word | 8 |
| x﻿y | BOM inside a cell | 2 |
| a‍b | ZWJ between letters | 2 |
| ​ | cell containing only ZWSP | 0 |
| 汉字​空格 | ZWSP between CJK | 8 |

## 4. Width gallery — one predictable token per cell

*Every cell in the first column is exactly one token; the second column is the display width the aligner MUST produce for that token. The harness asserts these pairs exactly. This table is ground truth for the width engine — nothing here may change width after alignment.*

| Token | Display width |
| --- | --- |
| 👨‍👩‍👧‍👦 | 2 |
| 🇭🇺 | 2 |
| 中文 | 4 |
| ｶ | 1 |
| é | 1 |
| a​b | 2 |
| ⭐️ | 2 |
| ☀ | 1 |
| ☀️ | 2 |
| 1️⃣ | 2 |
| 👍🏽 | 2 |
| 𝐀 | 1 |
| 한 | 2 |
| ᄀ | 2 |
| ᅡ | 1 |
| ！ | 2 |
| ─ | 1 |
| ➜ | 1 |
| न | 1 |
| ् | 0 |
| 𠀀 | 2 |
| 𝄞 | 1 |
| ✂ | 1 |
| → | 1 |
| │ | 1 |
| ‍ | 0 |

## 5. Mixed-script rows and whitespace inside cells

*Rows mix every script in a single line. Cells also carry literal tab characters, trailing spaces, cells that are only spaces, and completely empty cells — the aligner must preserve them byte-for-byte and treat tabs as content, never as structure.*

| Column one | Column two | Column three | Column four |
| --- | --- | --- | --- |
| 中文ABC123 | سلام שלום | นี่คือการทดสอบ | 👨‍👩‍👧‍👦🇭🇺 |
| ｶﾀｶﾅと漢字 | 𝐀𝐁𝐂 𝄞 | 𠀀𠀁𠀂 | ✂➜→│─┼ |
| left-tab→	here | a	b	c | 汉字	混合 | x	y	z |
| trailing   | spaces   | after text   | 　 |
|    |only spaces|     ||
| ||||
| é नमस्ते שלום | tiếng Việt สวัสดี | 中文のテキスト | e​x​t​r​a |
| short | row | | |

## 6. Dingbats, arrows, and box-drawing lookalikes

*© ® ™ ✂ ➜ are width-1 dingbats; ← → ↑ ↓ are width-1 arrows; │ ─ ┼ ═ are width-1 box-drawing glyphs that visually mimic the very borders the aligner paints. They are content, never structure, and never 2 columns.*

| Glyph | Name | Display width |
| --- | --- | --- |
| ✂ | scissors | 1 |
| ➜ | heavy round-tipped arrow | 1 |
| © | copyright sign | 1 |
| ® | registered sign | 1 |
| ™ | trade mark sign | 1 |
| → | rightwards arrow | 1 |
| ← | leftwards arrow | 1 |
| ↑ | upwards arrow | 1 |
| ↓ | downwards arrow | 1 |
| │ | box drawing vertical | 1 |
| ─ | box drawing horizontal | 1 |
| ┼ | box drawing cross | 1 |
| ═ | box drawing double horizontal | 1 |

## 7. Escaped pipes, inline-code pipes, and backslash puzzles

*`\|` inside a cell is cell content, not a delimiter; a pipe inside an inline code span is content too. A pipe preceded by an even number of backslashes is a REAL delimiter; an odd number escapes it. None of these cells may be split, merged, or reflowed.*

| Column A | Column B | Note |
| --- | --- | --- |
| a \| b | c | pipe in column A is escaped content |
| \| leading | c | escaped pipe at cell start |
| trailing \| | c | escaped pipe at cell end |
| `a\|b` | c | escaped pipe inside inline code |
| `a|b` | c | raw pipe inside inline code |
| a\\|b | c | even backslashes: this pipe is a REAL delimiter — the row parses as three cells |

## 8. Pipe-less rows and ragged columns

*GFM lets rows omit the leading or trailing pipe. The delimiter row sets the column count: short rows are padded with empty cells, extra cells are dropped. The aligner must neither invent nor delete content, and prose must never be absorbed into a table.*

name | score | notes
--- | --- | ---
alice | 10 | 汉字汉字
bob | 20
carol | 30 | extra | dropped

| left | center | right |
| :--- | :---: | ---: |
| a | b | c |
| short | row |
| one | two | three | four | five |

## 9. Long mixed lines — wrap stress

*These cells exceed the default 40-column width limit. This is a single-column table, and single-column tables never wrap (a wrapped cell's continuation lines would re-parse as new rows), so each cell stays on one line. The original codepoints must survive realignment.*

| Mixed soup |
| --- |
| 中文漢字カタカナひらがな한글 ＡＢＣ１２３ سلام שלום สวัสดี tiếng Việt 𝐀𝐁𝐂 𝄞 𠀀 ✂ ➜ → │ ─ ┼ 👨‍👩‍👧‍👦 🇭🇺 👍🏽 1️⃣ ⭐️ |
| 汉字测试宽度计算中文字符串宽度非常长的连续中文字符串没有任何空格可以断行只能逐字换行 |
| abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 |
