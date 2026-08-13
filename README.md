# format-md-tables

Markdown tables fall apart in terminals because the pipes are positioned by byte count, not display width: a single CJK ideograph, emoji sequence, or ANSI escape code shifts every vertical border below it. `format_md_tables` realigns markdown tables so every `|` sits at exactly the same display column in a monospace renderer, accounting for CJK ideographs, fullwidth forms, emoji ZWJ sequences, flags, skin-tone modifiers, keycaps, combining marks, zero-width characters, tabs, and ANSI escape codes inside the cells — and wraps over-wide cells so no column ever runs off the screen.

## Features

*   **Terminal-accurate width model** (Windows Terminal, kitty, wezterm):
    *   Emoji ZWJ sequences (`👨‍👩‍👧‍👦`) count as one double-width glyph
    *   Flags (`🇭🇺`) = 2 columns; skin-tone modifiers (`👍🏽`) attach to the base (0)
    *   Keycaps (`1️⃣`), CJK, fullwidth forms, Hangul = 2 columns
    *   Combining marks, ZWSP, variation selectors, ANSI escapes = 0 columns
*   **Cell wrapping** — columns wider than `--max-width` (default 40) wrap at word boundaries; continuation lines keep the pipe positions, so the whole table stays a regular aligned grid
*   **GFM-compliant detection** — only real tables (header + delimiter row) are touched; every other line passes through byte-identical
*   **Blockquote support** — `> | a | b |` and nested `> > ...` prefixes are preserved
*   **Idempotent** — running twice produces byte-identical output
*   **Byte-preserving** — BOM, dominant EOL (LF or CRLF), and final-newline presence survive

## Installation

### As an omp skill

The skill is installed at `~/.omp/agent/skills/format-md-tables/`. Invoke it via `skill://`:

```bash
bun skill://format-md-tables/format_md_tables.ts [options] FILE...
```

### Standalone

Copy `format_md_tables.ts` to a directory on your `PATH`. Requires Bun ≥ 1.2; no third-party dependencies.

## Usage

```bash
# Align files in place
bun format_md_tables.ts file1.md file2.md

# Check without modifying (exit 1 if any file would change)
bun format_md_tables.ts --check file.md

# Show the unified diff without modifying — output goes to stderr (exit 1 if any file would change)
bun format_md_tables.ts --diff file.md 2>&1

# Disable wrapping entirely: columns grow as wide as their content
bun format_md_tables.ts --max-width 0 file.md

# Set the tab stop used to expand tabs inside cells
bun format_md_tables.ts --tab-width 4 file.md

# Read from stdin, write the aligned result to stdout
cat file.md | bun format_md_tables.ts > aligned.md
```

The skill runs as TypeScript source — no build step. Invoke it with `bun skill://format-md-tables/format_md_tables.ts [options] FILE...`.

With no `FILE` arguments the input is read from stdin and the aligned result is written to stdout.

### Options

| Option          | Default     | Description                              |
| --------------- | ----------- | ---------------------------------------- |
| `FILE...`       | —           | Markdown files to align in place; omit   |
|                 |             | to read stdin                            |
| `--max-width N` | 40          | Wrap columns wider than N display        |
|                 |             | columns; `0` disables wrapping           |
| `--tab-width N` | 8           | Tab stop used when expanding tabs inside |
|                 |             | cells                                    |
| `--check`       | —           | Do not modify; exit 1 if any file would  |
|                 |             | change                                   |
| `--diff`        | —           | Print a unified diff to **stderr**; do   |
|                 |             | not modify; exit 1 if any file would     |
|                 |             | change                                   |
| `--version`     | —           | Print version and exit                   |

### Exit codes

| Code    | Meaning                                  |
| ------- | ---------------------------------------- |
| `0`     | Success — no changes needed (or changes  |
|         | applied in place)                        |
| `1`     | Changes would be needed (`--check` /     |
|         | `--diff`)                                |
| `2`     | Usage or I/O error (bad option value,    |
|         | unreadable file)                         |

## How wrapping works

Wrapping happens per cell before padding, so a table stays a regular grid: continuation lines reuse the same pipe positions and remain aligned.

*   **Word boundaries** — Latin text wraps at whitespace, preferring breaks at `/ ? & = . _ - , ; :` so URLs and file paths split at friendly points.
*   **CJK** — text without spaces wraps per character.
*   **Hard splits** — a single unbreakable token longer than `--max-width` (e.g. a long URL) is split at width into pieces, breaking the word across lines.
*   **`--max-width 0`** disables wrapping; columns grow unbounded.
*   **Column 0 and single-column tables never wrap** — a wrapped cell's continuation lines would put content in the first cell, making them indistinguishable from fresh rows when the table is re-parsed (and in any GFM renderer), silently corrupting the row count. Wrapping applies to columns 1..n-1 only; regardless of `--max-width`, column 0 and one-column tables stay on a single physical line.

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
*   **Width caps** — wrapped columns never exceed `--max-width`
*   **Content preservation** — BOM, CRLF/LF, final-newline, ANSI escapes
*   **Untouched lines** — non-table content passes through byte-identical
*   **Idempotency** — re-running produces byte-identical output
*   **Must-not-touch** — fenced code, HTML, math blocks, indented code
*   **Golden comparisons** and **CLI behavior** — exit codes, stdin/stdout, `--check`, `--diff`

## Known limitations

*   **Rendering targets wcwidth** — alignment targets terminal rendering (wcwidth semantics, unshaped widths); editors and browsers may render emoji or CJK at different widths, so the same table can look misaligned there.
*   **ANSI bytes occupy source positions** — escapes count as zero width but still consume bytes; misordered or unclosed escapes can shift raw pipe positions.
*   **Single-column tables never wrap** — regardless of `--max-width` (see "How wrapping works").
*   **Unbreakable tokens are hard-split** — a token longer than `--max-width` (e.g. a long URL) is broken into pieces at width, splitting the word.
*   Tables inside list items (`- | a | b |`) are not recognized as tables.
*   A hand-written row with an empty first cell that directly follows a row wider than `--max-width` is read as a continuation of that row; separate such rows with a blank line.

## License

MIT
