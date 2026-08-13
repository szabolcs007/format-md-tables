[![CI](https://github.com/szabolcs007/format-md-tables/actions/workflows/ci.yml/badge.svg)](https://github.com/szabolcs007/format-md-tables/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.2-orange.svg)](https://bun.sh)

# format-md-tables

Markdown tables can look misaligned in some terminals. The pipes are positioned by byte count rather than display width, so a CJK ideograph, an emoji sequence, a combining mark, or an ANSI escape code in one cell can shift every vertical border after it. Whether this happens depends on the renderer: terminals with wide or styled glyphs are the usual culprits, while many editors and browsers lay such tables out fine.

`format_md_tables` is a small command-line tool that realigns tables so every `|` sits at the same display column in a monospace renderer. It accounts for CJK ideographs, fullwidth forms, emoji ZWJ sequences, flags, skin-tone modifiers, keycaps, combining marks, zero-width characters, tabs, and ANSI escape codes inside cells.

## Features

*   **Display-width-aware alignment** (Windows Terminal, kitty, wezterm):
    *   Emoji ZWJ sequences (`👨‍👩‍👧‍👦`) count as one double-width glyph
    *   Flags (`🇭🇺`) = 2 columns; skin-tone modifiers (`👍🏽`) attach to the base (0)
    *   Keycaps (`1️⃣`), CJK, fullwidth forms, Hangul = 2 columns
    *   Combining marks, ZWSP, variation selectors, ANSI escapes = 0 columns
*   **Long-cell preservation** — cells are never wrapped, truncated, split, or annotated; their full display width is used for alignment
*   **GFM-compliant detection** — only real tables (header + delimiter row) are touched; every other line passes through unchanged
*   **Blockquote support** — `> | a | b |` and nested `> > ...` prefixes are preserved
*   **Safe to re-run** — running the tool twice leaves the file unchanged
*   **Byte-preserving** — BOM, dominant EOL (LF or CRLF), and final-newline presence survive

## Installation

There are two ways to use it: directly with Bun for scripts and CI, or as an agent skill for omp / Pi.

### Standalone with Bun

```bash
git clone https://github.com/szabolcs007/format-md-tables.git
cd format-md-tables
bun install

# Run directly
bun format_md_tables.ts [options] [FILE ...]

# Or put it on your PATH
chmod +x format_md_tables.ts
ln -s "$(pwd)/format_md_tables.ts" /usr/local/bin/format_md_tables
```

Requires [Bun ≥ 1.2](https://bun.sh). No build step — the TypeScript source runs as-is. No third-party runtime dependencies.

### As an omp skill

[Oh My Pi](https://github.com/can1357/oh-my-pi) discovers skills from `~/.omp/agent/skills/<name>/SKILL.md`, or from `.omp/skills/<name>/SKILL.md` inside a project. There is no installer; copy or symlink this repository there:

```bash
git clone https://github.com/szabolcs007/format-md-tables.git
mkdir -p ~/.omp/agent/skills
cp -r format-md-tables ~/.omp/agent/skills/format-md-tables
# or symlink: ln -s "$(pwd)/format-md-tables" ~/.omp/agent/skills/format-md-tables
```

### As a Pi skill

[Pi](https://pi.dev) uses a different location: `~/.pi/agent/skills/<name>/SKILL.md`, or `.pi/skills/<name>/SKILL.md` inside a project:

```bash
git clone https://github.com/szabolcs007/format-md-tables.git
mkdir -p ~/.pi/agent/skills
cp -r format-md-tables ~/.pi/agent/skills/format-md-tables
# or symlink: ln -s "$(pwd)/format-md-tables" ~/.pi/agent/skills/format-md-tables
```

### How the agent uses the skill

Once installed, omp and Pi list the skill's name and description in the LLM's context at startup, and the model typically picks it up on its own whenever tables need alignment. If you want to force it, use the skill command (`/skill:format-md-tables`) or run the script directly:

```bash
# omp
bun skill://format-md-tables/format_md_tables.ts [options] [FILE ...]

# Pi
bun ~/.pi/agent/skills/format-md-tables/format_md_tables.ts [options] [FILE ...]
```

## Usage

```bash
# Align files in place
bun format_md_tables.ts file1.md file2.md

# Check without modifying (exit 1 if any file would change)
bun format_md_tables.ts --check file.md

# Show the unified diff without modifying (exit 1 if any file would change)
bun format_md_tables.ts --diff file.md

# Set the tab stop used to expand tabs inside cells
bun format_md_tables.ts --tab-width 4 file.md

# Read from stdin, write the aligned result to stdout
cat file.md | bun format_md_tables.ts > aligned.md
```

With no file arguments, input is read from stdin and the aligned result is written to stdout.

### Options

| Option          | Default     | Description                                                                         |
| --------------- | ----------- | ----------------------------------------------------------------------------------- |
| `[FILE ...]`    | —           | Markdown files to align in place; omit to read stdin.                               |
| `--tab-width N` | 8           | Tab stop used when expanding tabs inside cells.                                     |
| `--check`       | —           | Do not modify; exit 1 if any file would change.                                     |
| `--diff`        | —           | Print a unified diff to stderr; do not modify; exit 1 if any file would change.     |
| `--version`     | —           | Print version and exit.                                                             |

`[FILE ...]` is the standard way to show a repeated positional argument (the same style argparse and most Unix tools use).

### Exit codes

| Code    | Meaning                                                            |
| ------- | ------------------------------------------------------------------ |
| `0`     | Success — no changes needed or changes applied in place.           |
| `1`     | Changes would be needed with `--check` or `--diff`.                |
| `2`     | Usage or I/O error, such as a bad option value or unreadable file. |

## Long content

Cells are never automatically wrapped, truncated, split, or annotated. The full display width of every cell determines its column width, so a table with very long prose, URLs, CJK text, or emoji may be horizontally wide. This is intentional: the formatter preserves content and keeps every logical row on one physical Markdown row.

When a renderer needs a narrower presentation, choose the structure manually: use `<br>` where the target renderer supports it, move prose into a list, or split a large table into smaller tables. The formatter never inserts these constructs itself.

## What is preserved

*   BOM, the dominant line ending (LF or CRLF), and final-newline presence
*   ANSI escape sequences — counted as zero width and copied byte-for-byte
*   All non-table lines: paragraphs, headings, lists, blockquotes, setext underlines, horizontal rules, indented code
*   Tables inside fenced code blocks (including unterminated fences), `$$` math blocks, and HTML blocks are never touched
*   Blockquote prefixes on table rows
*   Leading/trailing pipe style is normalized to the header row's style (render-identical in GFM and needed for consistent alignment)

## Testing

Run the test suite from the repository root:

```bash
bun test
```

The suite checks:

*   **Width-model ground truth** — CJK, fullwidth, combining marks, ZWJ sequences, flags, skin tones, keycaps, VS16
*   **Pixel alignment** — every pipe lands on the same display column
*   **Content preservation** — BOM, CRLF/LF, final-newline, ANSI escapes
*   **Untouched lines** — non-table content passes through unchanged
*   **Re-run stability** — a second run produces identical output
*   **Must-not-touch** — fenced code, HTML, math blocks, indented code
*   **Golden comparisons** — each fixture's output is compared byte-for-byte against a frozen reference file in `tests/expected/`; a mismatch is treated as a bug
*   **CLI behavior** — exit codes, stdin/stdout, `--check`, `--diff`

## Known limitations

*   **Alignment targets terminal rendering** — widths follow wcwidth semantics; editors and browsers may render emoji or CJK at different widths, so the same table can look misaligned there.
*   **ANSI bytes occupy source positions** — escapes count as zero width but still consume bytes; misordered or unclosed escapes can shift raw pipe positions.
*   Tables inside list items (`- | a | b |`) are not recognized as tables.
*   Empty first cells are ordinary physical table rows; they are never interpreted as continuation rows.

## License

MIT
