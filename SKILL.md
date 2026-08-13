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
bun skill://format-md-tables/format_md_tables.ts path/to/file.md

# Check without modifying (exit 1 if any file would change)
bun skill://format-md-tables/format_md_tables.ts --check path/to/file.md

# Print a unified diff to stderr without modifying (exit 1 if any file would change)
bun skill://format-md-tables/format_md_tables.ts --diff path/to/file.md

# With no file arguments: read stdin, write the aligned result to stdout
cat file.md | bun skill://format-md-tables/format_md_tables.ts
```

Exit codes: 0 = success/no changes, 1 = changes needed (with `--check`/`--diff`), 2 = usage or I/O error.

## What it does

Aligns every `|` of each GFM table to the same display column for a monospace renderer. Display width accounts for:

- CJK ideographs, fullwidth forms, Hangul — 2 columns
- Emoji sequences (ZWJ families, flags, skin-tone modifiers, keycaps) — 2 columns
- Combining marks and zero-width characters (accents, matras, ZWSP, variation selectors, ZWJ) — 0 columns
- ANSI escape codes — 0 columns, preserved
- Tabs — expanded at 8-column tab stops

Long cells are never automatically wrapped, truncated, split, or annotated. The full display width of every cell determines its column width, so tables with very long prose, URLs, CJK text, or emoji may be horizontally wide. Empty first cells are ordinary physical rows, not continuation markers.

When a target renderer needs a narrower presentation, choose the structure manually: use `<br>` where supported, move prose into a list, or split a large table into smaller tables. The formatter never inserts these constructs.

Escaped pipes (`\|`), pipes inside inline code spans, blockquote prefixes, and mixed leading/trailing pipe styles are handled; header/delimiter column-count mismatches are not tables per GFM and are left untouched.

## What it never touches

- Fenced code blocks (` ``` ` and `~~~`, including inside blockquotes) and indented code blocks (4+ spaces)
- HTML blocks (`<div>`, `<table>`, `<!-- comments -->`) and `$$` math blocks
- Paragraphs with pipes but no delimiter row
- Setext headings (`===`, `---`) and thematic breaks
- Tables inside list items
- BOM, LF/CRLF line endings, and final-newline presence are preserved byte-exactly; non-table lines are never rewritten

## Verification

- After running, visually verify alignment and row counts in a monospace renderer, especially for wide tables and manually authored empty-first-cell rows.
- The tool's own test suite (in `tests/`) validates the tool; run it only when you are changing `format_md_tables.ts` itself, not to verify your tables.

## Requirements

- Bun ≥ 1.2 — install: `curl -fsSL https://bun.sh/install | bash` on macOS/Linux, `powershell -c "irm bun.sh/install.ps1|iex"` on Windows.
