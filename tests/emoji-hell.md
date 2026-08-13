# Emoji hell

*Every table in this file attacks the emoji width rules: ZWJ families, flags, Fitzpatrick modifiers, keycaps, and variation selectors — plus their degenerate half-formed cousins. An emoji presentation sequence (ZWJ family, flag, skin-tone, keycap, or VS16 sequence) is exactly 2 columns; a bare text-presentation base is 1; a lone modifier, lone regional indicator, stray ZWJ, or bare VS16 is counted on its own. The aligner must never merge, split, or reorder these clusters, and alignment must not change a single codepoint.*

## 1. ZWJ families and professions

*Man + ZWJ + woman + ZWJ + girl + ZWJ + boy is ONE cell of width 2. So is every ZWJ sequence below, whatever it depicts. The description column is prose and must never leak into the emoji column.*

| Emoji | Description |
| --- | --- |
| 👨‍👩‍👧‍👦 | family: man, woman, girl, boy |
| 👨‍👩‍👧‍👦👨‍👩‍👧‍👦 | two families back to back — width 4 |
| 👩‍💻 | woman technologist |
| 👨‍🍳 | man cook |
| 🧑‍🤝‍🧑 | people holding hands |
| 👨‍❤️‍👨 | couple with heart |
| ❤️‍🔥 | heart on fire |
| ❤️‍🩹 | mending heart |
| 👁️‍🗨️ | eye in speech bubble |
| 🐻‍❄️ | polar bear |
| 😶‍🌫️ | face in clouds |
| 👨‍👦 | family of two |

## 2. Flags and regional indicators

*Two regional-indicator letters make one flag — one cell, width 2. A lone regional indicator is still a 2-wide glyph (East Asian Width W). A pair of indicators that is not a real country code is also a 2-wide sequence, and two flags side by side are 4 columns.*

| Flag | Territory |
| --- | --- |
| 🇭🇺 | Hungary |
| 🇩🇪 | Germany |
| 🇯🇵 | Japan |
| 🇺🇸 | United States |
| 🇦🇶 | Antarctica |
| 🇭 | lone regional indicator — width 2 |
| 🇦🇦 | invalid pair, still a 2-wide sequence |
| 🇭🇺🇩🇪 | two flags in one cell — width 4 |
| 👍🏽🇭🇺 | skin-tone emoji glued to a flag |

## 3. Skin-tone modifiers

*Base emoji + Fitzpatrick modifier (U+1F3FB..U+1F3FF) is one cluster of width 2 — including chains where a second ZWJ sequence hangs off the modified base. A lone modifier is a 2-wide glyph of its own.*

| Emoji | Meaning |
| --- | --- |
| 👍🏽 | thumbs up, medium skin tone |
| 👍🏻 | thumbs up, light |
| 👍🏿 | thumbs up, dark |
| 🧑🏿‍🦰 | person, dark skin, red hair |
| 👩🏽‍🦱 | woman, medium skin tone, curly hair |
| 🦸🏾‍♀️ | superheroine, medium-dark |
| 🏽 | lone Fitzpatrick modifier — width 2 |
| 👍🏽👍🏽 | two modified thumbs — width 4 |

## 4. Keycaps and variation selectors

*A keycap is digit + VS16 + U+20E3, one cluster of width 2. U+FE0F (VS16) promotes a text-presentation base to emoji presentation: ☀ is 1 column, ☀️ is 2. The two MUST stay distinct cells with distinct widths.*

| Glyph | Display width |
| --- | --- |
| 1️⃣ | 2 |
| 2️⃣ | 2 |
| 9️⃣ | 2 |
| 0️⃣ | 2 |
| #️⃣ | 2 |
| ☀️ | 2 |
| ☀ | 1 |
| ❤️ | 2 |
| ❤ | 1 |
| ♥️ | 2 |
| ♥ | 1 |
| ✔️ | 2 |
| ✔ | 1 |

## 5. Placement and degenerate sequences

*Emoji at the start or end of a cell, wedged between CJK or Latin, with a combining mark stacked on top, with a stray ZWJ, or split apart by ZWSP — each must be counted cluster-by-cluster and preserved codepoint-for-codepoint.*

| Cell | What it is |
| --- | --- |
| 👍 starts a cell | leading emoji |
| ends with ❤️ | trailing emoji |
| 中文👍中文 | emoji between CJK |
| abc⭐️xyz | emoji between Latin |
| 👍🏽́ | emoji + combining acute on top |
| ❤️‍ | heart + VS16 + stray ZWJ |
| a‍b | ZWJ between Latin letters |
| 👨‍ | lone man + stray ZWJ |
| 👨‍👩 | truncated family (man ZWJ woman) |
| 👍​🏽 | ZWSP splits base from modifier |
| 🇭🇺👍 | flag then emoji |
| 👍🇭🇺 | emoji then flag |

## 6. Emoji width gallery — one predictable token per cell

*Same contract as the companion gallery: the first column is exactly one token, the second column is the display width the aligner MUST compute. Assert these pairs exactly.*

| Token | Display width |
| --- | --- |
| 👨‍👩‍👧‍👦 | 2 |
| 🇭🇺 | 2 |
| 👍🏽 | 2 |
| 🧑🏿‍🦰 | 2 |
| 1️⃣ | 2 |
| ⭐️ | 2 |
| ☀️ | 2 |
| ☀ | 1 |
| ❤️ | 2 |
| ❤ | 1 |
| ‍ | 0 |
| 🇭 | 2 |
| 🏽 | 2 |
| ️ | 0 |

## 7. Long emoji lines — display-width alignment

*These cells exceed ordinary terminal widths; each cell stays on one physical
row and identical codepoints must survive realignment.*

| Status log |
| --- |
| 更新完成✅ 已部署🚀 运行正常❤️ 中文测试👍 カタカナ⛄️ 次のステップ➡️ 汉字宽度必须正确计算 |
| 👨‍👩‍👧‍👦 👨‍👩‍👧‍👦 🇭🇺 🇩🇪 🇯🇵 👍🏽 🧑🏿‍🦰 1️⃣ 2️⃣ ⭐️ ❤️ ☀️ 👩‍💻 🐻‍❄️ 🦸🏾‍♀️ 👨‍🍳 👨‍❤️‍👨 ❤️‍🔥 ❤️‍🩹 👁️‍🗨️ 😶‍🌫️ |
| 汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字 |
