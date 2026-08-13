# Wrapping stress fixtures

*This file is an input for the markdown table aligner. Every table here is
aligned at a maximum column width of 40 display columns: any cell wider than
that must wrap at word boundaries, and CJK text without spaces wraps per
character. Nothing outside the tables may ever be changed — headings, prose,
delimiter rows, and cell text stay exactly as written.*

## Single very long words

*A cell holding one unbroken token. The classics are just under the 40-column
limit (boundary probes); the longer tokens have no space or hyphen anywhere, so
the aligner must decide how to keep them intact. The length column is the true
character count and must survive alignment unchanged.*

| word | length |
| --- | --- |
| supercalifragilisticexpialidocious | 34 |
| antidisestablishmentarianism | 28 |
| pneumonoultramicroscopicsilicovolcanoconiosis | 45 |
| floccinaucinihilipilification | 29 |
| supercalifragilisticexpialidociousantidisestablishmentarianism | 62 |
| floccinaucinihilipilificationsupercalifragilisticexpialidociousantidisestablishmentarianism | 91 |

## Very long URLs

*URLs have no spaces; they must hard-split at URL-friendly punctuation so each
fragment stays under the limit and every path segment survives in order.*

| service | endpoint |
| --- | --- |
| api | https://example.com/a/very/long/path?query=with&params=here&more=stuff |
| docs | https://docs.example.org/reference/manual/installation-guide/advanced-setup-2026 |
| raw | https://raw.githubusercontent.com/org/repo/main/packages/core/src/utils/helpers.py |

## Paragraph-like cells

*Word text wraps at word boundaries; every word must survive in exactly this
order, never split mid-word.*

| id | notes |
| --- | --- |
| 1 | This sentence is deliberately long so that the aligner must wrap it across several lines while preserving every single word in exactly this order and never splitting a word in the middle of it. |
| 2 | Short. |
| 3 | Another verbose paragraph-like cell that keeps going and going well past forty display columns to prove that multi-line wrapping produces continuation rows with an empty first cell and keeps every word. |

## CJK per-character wrapping

*CJK runs have no spaces; the aligner must split per character (two columns
each) so no fragment exceeds the limit, preserving every character and its
order.*

| 语言 | 示例 |
| --- | --- |
| 简体 | 这个单元格包含一段很长且完全没有空格的中文句子它必须逐字换行直到填满四十列显示宽度为止并且每个汉字都要原样保留 |
| 繁體 | 這一段繁體中文同樣沒有空格必須逐字折行任何一個字元都不可以遺失順序也不可以改變 |
| 混合 | 中文句子mixed withEnglish words and CJK標點，全形符號（，。：；）也要計入顯示寬度 |
| 仮名 | 日本語の文章も空白がなくても一文字ずつ折り返して表示幅を守ること |

## Column 0 never wraps

*Column 0 is the stub column: a wrapped continuation would put content in the
first cell and re-parse as a fresh row, so column 0 is never wrapped — a huge
cell in it keeps the column wide. Later columns still wrap normally, with
continuation rows carrying an empty first cell.*

| A | B | C |
| --- | --- | --- |
| x | tiny | z |
| This is a huge cell that sits inside the one-character column A and must stay on one line even though it is far beyond the forty-column maximum because column zero never wraps | tiny | z |
| 2 | Another verbose paragraph-like cell that keeps going and going well past forty display columns to prove that multi-line wrapping produces continuation rows with an empty first cell and keeps every word. | q |

## Middle cell wraps, neighbours empty

*The middle cell is the only one over the limit; it wraps by itself while the
empty neighbours stay empty.*

| A | B | C |
| --- | --- | --- |
| left | middle | right |
| filled | | also wrapped here with a fairly long sentence that goes well beyond the forty column threshold just to make sure the empty cell between stays empty |
| | This middle cell is very long and wraps over several lines while both of its neighbours remain completely empty | |

## Long hyphenated words

*Hyphens are allowed wrap points; a hyphenated token may break at a hyphen and
the hyphen stays attached to the piece before the break.*

| term | definition |
| --- | --- |
| foo-bar-baz | A triple-hyphenated word long enough to wrap: counter-revolutionary-disestablishmentarianism |
| long | well-known-international-business-machines-corporation-style-hyphenated-token |

## Mixed long tokens and short words

*Short words around one long token: the token must move to its own line rather
than being split.*

| id | text |
| --- | --- |
| 7 | cat supercalifragilisticexpialidocious dog |
| 8 | short words then pneumonoultramicroscopicsilicovolcanoconiosis then a few more short words |
| 9 | x y z supercalifragilisticexpialidociousantidisestablishmentarianism u v w |

## Cells with many consecutive spaces

*Runs of spaces are one display column each. Cells that fit within the limit
keep their spacing byte for byte (the aligner never rewrites an unwrapped
cell); a cell that wraps reflows whitespace runs to single spaces at break
points so the wrapped fragments stay within the column.*

| lang | command |
| --- | --- |
| python | import sys # four spaces between tokens |
| shell | echo -e "a b" # spaces only, no tabs |
| gap | alpha omega with forty-four spaces                between the two words |
| pad |     four leading spaces in this cell |

## Wide and zero-width characters

*Wrapping is driven by display width, not character count: CJK and emoji count
as two columns, combining marks / variation selectors / ZWJ / ZWSP count as
zero.*

| status | payload |
| --- | --- |
| ready | Emoji at the start of a cell that then continues with words past the forty-column limit to prove that width accounting treats emoji as two columns |
| family | 👨‍👩‍👧‍👦 |
| flag | 🇯🇵 |
| keycap | 1️⃣ |
| tone | 👍🏽 |
| heart | ❤️ |
| accent | café is four display columns, naïve is five |
| zwsp | zero​width​space adds no display width |
| rockets | 🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀 |
