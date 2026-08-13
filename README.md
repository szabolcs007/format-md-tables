[![CI](https://github.com/szabolcs007/format-md-tables/actions/workflows/ci.yml/badge.svg)](https://github.com/szabolcs007/format-md-tables/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.2-orange.svg)](https://bun.sh)

# format-md-tables

Markdown tables fall apart in terminals because the pipes are positioned by byte count, not display width: a single CJK ideograph, emoji sequence, or ANSI escape code shifts every vertical border below it. `format_md_tables` realigns markdown tables so every `|` sits at exactly the same display column in a monospace renderer, accounting for CJK ideographs, fullwidth forms, emoji ZWJ sequences, flags, skin-tone modifiers, keycaps, combining marks, zero-width characters, tabs, and ANSI escape codes inside the cells.

## Features

*   **Terminal-accurate width model** (Windows Terminal, kitty, wezterm):
    *   Emoji ZWJ sequences (`👨‍👩‍👧‍👦`) count as one double-width glyph
    *   Flags (`🇭🇺`) = 2 columns; skin-tone modifiers (`👍🏽`) attach to the base (0)
    *   Keycaps (`1️⃣`), CJK, fullwidth forms, Hangul = 2 columns
    *   Combining marks, ZWSP, variation selectors, ANSI escapes = 0 columns
*   **Long-cell preservation** — cells are never automatically wrapped, truncated, split, or annotated; their full display width is used for alignment
*   **GFM-compliant detection** — only real tables (header + delimiter row) are touched; every other line passes through byte-identical
*   **Blockquote support** — `> | a | b |` and nested `> > ...` prefixes are preserved
*   **Idempotent** — running twice produces byte-identical output
*   **Byte-preserving** — BOM, dominant EOL (LF or CRLF), and final-newline presence survive

## Installation

### From source (recommended)

```bash
git clone https://github.com/szabolcs007/format-md-tables.git
cd format-md-tables
bun install

# Run directly
bun format_md_tables.ts [options] FILE...

# Or add to PATH
chmod +x format_md_tables.ts
ln -s "$(pwd)/format_md_tables.ts" /usr/local/bin/format_md_tables
```

Requires [Bun ≥ 1.2](https://bun.sh). No build step; runs as TypeScript source. No third-party runtime dependencies.

### As an omp skill

[Oh My Pi](https://github.com/can1357/oh-my-pi) discovers skills from `~/.omp/agent/skills/<name>/SKILL.md` — there is no installer; copy or symlink this directory there:

```bash
git clone https://github.com/szabolcs007/format-md-tables.git
mkdir -p ~/.omp/agent/skills
cp -r format-md-tables ~/.omp/agent/skills/format-md-tables
# or symlink: ln -s "$(pwd)/format-md-tables" ~/.omp/agent/skills/format-md-tables
```

Once installed, the LLM sees the skill's name and description at startup and will typically pick it up on its own whenever you edit markdown files containing tables. You can also invoke it directly via `skill://`:

```bash
bun skill://format-md-tables/format_md_tables.ts [options] FILE...
```

## Usage

```bash
# Align files in place
bun format_md_tables.ts file1.md file2.md

# Check without modifying (exit 1 if any file would change)
bun format_md_tables.ts --check file.md

# Show the unified diff without modifying — output goes to stderr (exit 1 if any file would change)
bun format_md_tables.ts --diff file.md 2>&1

# Set the tab stop used to expand tabs inside cells
bun format_md_tables.ts --tab-width 4 file.md

# Read from stdin, write the aligned result to stdout
cat file.md | bun format_md_tables.ts > aligned.md
```

The skill runs as TypeScript source — no build step. Invoke it with `bun skill://format-md-tables/format_md_tables.ts [options] FILE...`.

With no `FILE` arguments the input is read from stdin and the aligned result is written to stdout.

### Options

| Option          | Default     | Description                                                                         |
| --------------- | ----------- | ----------------------------------------------------------------------------------- |
| `FILE...`       | —           | Markdown files to align in place; omit to read stdin.                               |
| `--tab-width N` | 8           | Tab stop used when expanding tabs inside cells.                                     |
| `--check`       | —           | Do not modify; exit 1 if any file would change.                                     |
| `--diff`        | —           | Print a unified diff to **stderr**; do not modify; exit 1 if any file would change. |
| `--version`     | —           | Print version and exit.                                                             |

### Exit codes

| Code    | Meaning                                                            |
| ------- | ------------------------------------------------------------------ |
| `0`     | Success — no changes needed or changes applied in place.           |
| `1`     | Changes would be needed with `--check` or `--diff`.                |
| `2`     | Usage or I/O error, such as a bad option value or unreadable file. |

## Long content

Cells are never automatically wrapped, truncated, split, or annotated. The
full display width of every cell determines its column width, so a table with
very long prose, URLs, CJK text, or emoji may be horizontally wide. This is
intentional: the formatter preserves content and keeps every logical row on
one physical Markdown row.

When a renderer needs a narrower presentation, choose the structure manually:
use `<br>` where the target renderer supports it, move prose into a list, or
split a large table into smaller tables. The formatter never inserts these
constructs itself.

## What is preserved

*   BOM, the dominant line ending (LF or CRLF), and final-newline presence
*   ANSI escape sequences — counted as zero width and copied byte-for-byte
*   All non-table lines: paragraphs, headings, lists, blockquotes, setext underlines, horizontal rules, indented code
*   Tables inside fenced code blocks (including unterminated fences), `$$` math blocks, and HTML blocks are never touched
*   Blockquote prefixes on table rows
*   Leading/trailing pipe style is normalized to the header row's style (render-identical in GFM and required for pixel-perfect alignment)

## Testing

Run the test suite from the repository root:

```bash
bun test
```

The harness validates invariants rather than a fixed assertion count (it is dynamic):

*   **Width-model ground truth** — CJK, fullwidth, combining marks, ZWJ sequences, flags, skin tones, keycaps, VS16
*   **Pixel alignment** — every pipe lands on the same display column
*   **Content preservation** — BOM, CRLF/LF, final-newline, ANSI escapes
*   **Untouched lines** — non-table content passes through byte-identical
*   **Idempotency** — re-running produces byte-identical output
*   **Must-not-touch** — fenced code, HTML, math blocks, indented code
*   **Golden comparisons** and **CLI behavior** — exit codes, stdin/stdout, `--check`, `--diff`

## Known limitations

*   **Rendering targets wcwidth** — alignment targets terminal rendering (wcwidth semantics, unshaped widths); editors and browsers may render emoji or CJK at different widths, so the same table can look misaligned there.
*   **ANSI bytes occupy source positions** — escapes count as zero width but still consume bytes; misordered or unclosed escapes can shift raw pipe positions.
*   Tables inside list items (`- | a | b |`) are not recognized as tables.
*   Empty first cells are ordinary physical table rows; they are never interpreted as continuation rows.
## License

MIT
