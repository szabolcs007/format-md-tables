---
name: format-md-tables
description: Realign GFM table borders in markdown files. Use after creating or editing markdown files that contain tables, or to check/diff table alignment before committing.
---

# Format MD Tables

**Trigger:** You have just created or modified a markdown file containing one or more GFM tables.

**Action:** Run the formatter on every modified file that contains tables before committing or yielding. Files without tables are skipped.

## How to run

```bash
# Format a file in place
python skill://format-md-tables/format_md_tables.py path/to/file.md

# Check without modifying (exit 1 if any file would change)
python skill://format-md-tables/format_md_tables.py --check path/to/file.md

# Print a unified diff to stderr without modifying (exit 1 if any file would change)
python skill://format-md-tables/format_md_tables.py --diff path/to/file.md

# Disable column wrapping (default max width is 40 display columns)
python skill://format-md-tables/format_md_tables.py --max-width 0 path/to/file.md

# With no file arguments: read stdin, write the aligned result to stdout
cat file.md | python skill://format-md-tables/format_md_tables.py
```

Exit codes: 0 = success/no changes, 1 = changes needed (with `--check`/`--diff`), 2 = usage or I/O error.

## What it does

Aligns every `|` of each GFM table to the same display column for a monospace renderer. Display width accounts for:

- CJK ideographs, fullwidth forms, Hangul — 2 columns
- Emoji sequences (ZWJ families, flags, skin-tone modifiers, keycaps) — 2 columns
- Combining marks and zero-width characters (accents, matras, ZWSP, variation selectors, ZWJ) — 0 columns
- ANSI escape codes — 0 columns, preserved
- Tabs — expanded at 8-column tab stops

Columns wider than `--max-width` (default 40) display columns are wrapped into multiple physical lines; continuation lines get an empty first cell and identical pipe positions. Wrapping rules:

- Word text breaks at word boundaries, preferring `/?&=._-,;:`
- CJK text without spaces wraps per character
- Unbreakable tokens wider than the limit are hard-split
- **Column 0 (and single-column tables) never wrap** — a wrapped cell's continuation lines would put content in the first cell, re-parse as new rows (and render as extra rows in GFM renderers), corrupting the row count. Wrapping applies to columns 1..n-1 only; `--max-width 0` disables wrapping everywhere.

Escaped pipes (`\|`), pipes inside inline code spans, blockquote prefixes, and mixed leading/trailing pipe styles are handled; header/delimiter column-count mismatches are not tables per GFM and are left untouched.

## What it never touches

- Fenced code blocks (` ``` ` and `~~~`, including inside blockquotes) and indented code blocks (4+ spaces)
- HTML blocks (`<div>`, `<table>`, `<!-- comments -->`) and `$$` math blocks
- Paragraphs with pipes but no delimiter row
- Setext headings (`===`, `---`) and thematic breaks
- Tables inside list items
- BOM, LF/CRLF line endings, and final-newline presence are preserved byte-exactly; non-table lines are never rewritten

## Verification

- After running, visually verify your tables in a monospace renderer: alignment, wrapped continuation rows, and row counts — especially for wide or single-column tables.
- The tool's own test suite (in `tests/`) validates the tool; run it only when you are changing `format_md_tables.py` itself, not to verify your tables.
