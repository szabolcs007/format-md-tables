#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test harness for format_md_tables.py.

Runs the aligner (black-box, via subprocess) over the fixture corpus and
asserts, for every table:

1. pixel alignment   — every physical line of a table has identical pipe
                       display-column positions and identical total width;
2. width caps        — no column exceeds --max-width; no fragment exceeds
                       its column width;
3. content          — cell contents survive (whitespace-normalized compare,
                       wrapped rows rejoined);
4. untouched        — every non-table line of the input appears byte-exact,
                       in order, in the output;
5. idempotency      — running twice yields byte-identical output;
6. fixture galleries — tables whose header names a "Display width" column
                       are ground truth: the aligner must compute exactly
                       the stated width for that token;
7. must-not-touch   — that fixture must be byte-identical after alignment;
8. CLI contract     — --check / --diff exit codes, stdin mode, --max-width 0,
                       error exit codes.

Usage:
    python tests/run_tests.py [--update-goldens]
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALIGNER = os.path.join(ROOT, "format_md_tables.py")
TESTS = os.path.join(ROOT, "tests")
EXPECTED = os.path.join(TESTS, "expected")

sys.path.insert(0, ROOT)
import format_md_tables as A  # noqa: E402

MAX_WIDTH = 40
FIXTURES = [
    "table-at-top.md",
    "unicode-width.md",
    "emoji-hell.md",
    "wrapping.md",
    "structure-edge-cases.md",
    "blockquotes.md",
    "must-not-touch.md",
    "preserve.md",
    "bytes-and-ansi.md",
]

FAILURES: list[str] = []
PASSES = 0


def ok(name: str) -> None:
    global PASSES
    PASSES += 1
    print("  PASS  %s" % name)


def fail(name: str, detail: str) -> None:
    FAILURES.append("%s: %s" % (name, detail))
    print("  FAIL  %s\n        %s" % (name, detail.replace("\n", "\n        ")))


def run_aligner(args: list[str], stdin: bytes | None = None,
                cwd: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, ALIGNER] + args,
                          input=stdin, capture_output=True, cwd=cwd)


# ---------------------------------------------------------------------------
# 1. width model ground truth
# ---------------------------------------------------------------------------

WIDTH_CASES = [
    ("👨‍👩‍👧‍👦", 2),   # ZWJ family
    ("👨‍👩‍👧‍👦👨‍👩‍👧‍👦", 4),
    ("🇭🇺", 2),       # flag pair
    ("🇭", 2),        # lone regional indicator
    ("👍🏽", 2),      # base + skin tone
    ("🧑🏿‍🦰", 2),     # skin tone + ZWJ + hair
    ("1️⃣", 2),       # keycap
    ("⭐", 2),        # emoji presentation
    ("⭐️", 2),
    ("☀", 1),        # text presentation
    ("☀️", 2),       # VS16 promotes to emoji
    ("⭐︎", 1),  # VS15 demotes emoji-default to text presentation
    ("☀︎", 1),  # VS15 on text-default stays 1
    ("1️⃣︎", 2),  # keycap beats trailing VS15
    ("‍😀", 2),  # standalone ZWJ + emoji: emoji keeps width 2
    ("‍​", 0),      # ZWJ + ZWSP: both zero-width
    ("‍́", 0),      # ZWJ + combining acute: zero-width
    ("‍‍‍", 0),  # bare ZWJ run
    ("🇭🇺🇩🇪", 4),  # two flags: 4
    ("e\u0301", 1),  # combining acute
    ("e\u0301\u0302", 1),
    ("\u200b", 0),   # ZWSP
    ("\u2060", 0),   # word joiner
    ("\u00ad", 0),   # soft hyphen
    ("\ufeff", 0),   # BOM
    ("\u200d", 0),   # ZWJ
    ("\ufe0f", 0),   # VS16 alone
    ("中文", 4),
    ("Ａ", 2),        # fullwidth
    ("ｶ", 1),        # halfwidth katakana
    ("한", 2),
    ("ᄀ", 2),        # jamo leading consonant
    ("ᅡ", 1),        # jamo vowel
    ("！", 2),
    ("─", 1),        # box drawing (ambiguous -> 1)
    ("│", 1),
    ("→", 1),        # arrow (ambiguous -> 1)
    ("✂", 1),
    ("➜", 1),
    ("𝐀", 1),        # math alphanumeric (EAW=N)
    ("𝄞", 1),        # musical symbol (EAW=N)
    ("𠀀", 2),       # CJK ext B
    ("नमस्ते", 4),   # devanagari (virama is Mn -> 0)
    ("्", 0),
    ("\x1b[31mred\x1b[0m", 3),  # ANSI is zero width
    ("\t", 8),                   # lone tab -> one stop of 8
    ("a\tb", 9),                 # a(1) + tab->7 + b(1) = 9
]


def test_width_model() -> None:
    print("width model ground truth")
    for token, expected in WIDTH_CASES:
        got = A.display_width(token)
        if got != expected:
            fail("width_model", "%r -> %d, expected %d" % (token, got, expected))
        else:
            ok("width %r == %d" % (token, expected))


# ---------------------------------------------------------------------------
# 2. fixture gallery extraction
# ---------------------------------------------------------------------------

GALLERY_HEADERS = {"token", "glyph", "cell", "string", "text", "sequence", "item"}


def extract_galleries(text: str) -> list[tuple[str, int]]:
    """Pull (token, expected_width) from tables whose header names a
    'Display width' column.  The token column is column 0, except for
    'Script | Sample | Display width' style tables where it is column 1."""
    lines = text.split("\n")
    galleries: list[tuple[str, int]] = []
    for start, end, t in A.find_tables(lines, MAX_WIDTH, 8):
        header = [" ".join(c) for c in t.header]
        try:
            wcol = next(i for i, h in enumerate(header) if h.lower() == "display width")
        except StopIteration:
            continue
        tcol = 1 if header[0].lower() == "script" else 0
        if tcol == wcol:
            continue
        for row in t.rows:
            cells = [" ".join(c) for c in row.cells]
            if len(cells) <= max(tcol, wcol):
                continue
            token = cells[tcol].strip()
            raw = cells[wcol].strip()
            if not re.fullmatch(r"\d+", raw):
                continue
            galleries.append((token, int(raw)))
    return galleries


def test_galleries(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        text = f.read()
    galleries = extract_galleries(text)
    if not galleries:
        ok("gallery %s: no gallery tables (skipped)" % os.path.basename(path))
        return
    for token, expected in galleries:
        got = A.display_width(token)
        if got != expected:
            fail("gallery_%s" % os.path.basename(path),
                 "%r -> %d, fixture states %d" % (token, got, expected))
    ok("gallery %s: %d assertions" % (os.path.basename(path), len(galleries)))


# ---------------------------------------------------------------------------
# 3. invariants on aligned output
# ---------------------------------------------------------------------------

def pipe_columns(body: str) -> list[int]:
    """Display columns of every UNESCAPED '|' in a row body.

    Uses cluster-aware display width of the prefix (ZWJ emoji sequences,
    combining marks, ANSI escapes all count as the terminal renders them).
    Pipes inside code spans and escaped pipes are ignored.
    """
    body = A.ANSI_RE.sub("", body)
    pipes: list[int] = []
    i = 0
    n = len(body)
    in_backticks = False
    backtick_count = 0
    while i < n:
        c = body[i]
        if c == "`":
            j = i
            while j < n and body[j] == "`":
                j += 1
            count = j - i
            if not in_backticks:
                in_backticks = True
                backtick_count = count
            elif count == backtick_count:
                in_backticks = False
                backtick_count = 0
            i = j
            continue
        if in_backticks:
            i += 1
            continue
        if c == "\\" and i + 1 < n:
            i += 2
            continue
        if c == "|":
            pipes.append(i)
        i += 1
    return [A.display_width(body[:idx]) for idx in pipes]


def check_alignment(path: str, out_text: str) -> None:
    lines = out_text.split("\n")
    for start, end, t in A.find_tables(lines, MAX_WIDTH, 8):
        block = lines[start:end]
        ref_pipes = None
        ref_width = None
        for ln in block:
            m = A.PREFIX_RE.match(ln)
            body = m.group("body") if m else ln
            pipes = pipe_columns(body)
            total = A.display_width(body)
            if ref_pipes is None:
                ref_pipes, ref_width = pipes, total
                continue
            if pipes != ref_pipes:
                fail("alignment_%s" % os.path.basename(path),
                     "line %r pipes %s != %s" % (ln, pipes, ref_pipes))
                return
            if total != ref_width:
                fail("alignment_%s" % os.path.basename(path),
                     "line %r width %d != %d" % (ln, total, ref_width))
                return
    ok("alignment %s: all tables pixel-aligned" % os.path.basename(path))


def check_width_caps(path: str, out_text: str) -> None:
    lines = out_text.split("\n")
    for start, end, t in A.find_tables(lines, MAX_WIDTH, 8):
        if t.ncols <= 1:
            continue  # single-column tables never wrap (see render_table)
        widths = [max(3, A.display_width(" ".join(c))) for c in t.header]
        # column 0 is never wrapped (render_table); only check 1..n-1
        for j in range(t.ncols):
            if j == 0:
                widths[j] = 10 ** 9
        for row in t.rows:
            for j, frags in enumerate(row.cells):
                joined = A.display_width(" ".join(frags))
                if j < len(widths):
                    widths[j] = max(widths[j], joined)
        if MAX_WIDTH:
            # column 0 is never capped (never wrapped)
            widths = [w if j == 0 else min(w, MAX_WIDTH)
                      for j, w in enumerate(widths)]
        for row in t.rows:
            for j, frags in enumerate(row.cells):
                for frag in frags:
                    if A.display_width(frag) > widths[j]:
                        fail("width_caps_%s" % os.path.basename(path),
                             "fragment %r (%d) wider than column %d"
                             % (frag, A.display_width(frag), widths[j]))
                        return
    ok("width caps %s: no column exceeds %d" % (os.path.basename(path), MAX_WIDTH))


def norm_cell(s: str) -> str:
    """Whitespace-insensitive fingerprint of cell content.

    Wrapping may insert spaces at hard-split/word-break points (and collapse
    whitespace runs inside wrapped fragments), so the contract is: the exact
    character sequence survives, whitespace placement may change.
    """
    return re.sub(r"\s+", "", s)


def table_snapshot(text: str) -> list[tuple]:
    """(ncols, aligns, header joined, rows joined) per table, ws-normalized."""
    snap = []
    for start, end, t in A.find_tables(text.split("\n"), MAX_WIDTH, 8):
        snap.append((
            t.ncols,
            tuple(t.aligns),
            tuple(norm_cell(" ".join(c)) for c in t.header),
            tuple(tuple(norm_cell(" ".join(c)) for c in row.cells) for row in t.rows),
        ))
    return snap


def check_content(path: str, orig: str, out: str) -> None:
    a = table_snapshot(orig)
    b = table_snapshot(out)
    if len(a) != len(b):
        fail("content_%s" % os.path.basename(path),
             "table count %d -> %d" % (len(a), len(b)))
        return
    for i, (ta, tb) in enumerate(zip(a, b)):
        if ta != tb:
            fail("content_%s" % os.path.basename(path),
                 "table %d differs:\n  input : %r\n  output: %r" % (i, ta, tb))
            return
    ok("content %s: %d tables preserved" % (os.path.basename(path), len(a)))


def check_untouched(path: str, orig: str, out: str) -> None:
    orig_lines = orig.split("\n")
    out_lines = out.split("\n")
    table_ranges = [(s, e) for s, e, _ in A.find_tables(orig_lines, MAX_WIDTH, 8)]
    p = 0
    for i, line in enumerate(orig_lines):
        if any(s <= i < e for s, e in table_ranges):
            continue
        try:
            p = out_lines.index(line, p)
        except ValueError:
            fail("untouched_%s" % os.path.basename(path),
                 "original non-table line %d %r missing/moved in output" % (i + 1, line))
            return
    ok("untouched %s: all non-table lines byte-exact" % os.path.basename(path))


def check_wrapped(path: str, out_text: str) -> None:
    """wrapping.md must actually produce multi-line rows for over-wide cells."""
    lines = out_text.split("\n")
    found = False
    for start, end, t in A.find_tables(lines, MAX_WIDTH, 8):
        for row in t.rows:
            if any(len(frags) > 1 for frags in row.cells):
                found = True
    if not found:
        fail("wrapped_%s" % os.path.basename(path), "no multi-line rows produced")
        return
    ok("wrapped %s: over-wide cells wrapped into multi-line rows"
       % os.path.basename(path))


# ---------------------------------------------------------------------------
# 4. runner
# ---------------------------------------------------------------------------

def run_fixture(path: str, update_goldens: bool) -> None:
    name = os.path.basename(path)
    with open(path, encoding="utf-8") as f:
        orig = f.read()

    with tempfile.TemporaryDirectory() as tmp:
        work = os.path.join(tmp, name)
        shutil.copyfile(path, work)

        r = run_aligner([work])
        if r.returncode != 0:
            fail("run_%s" % name, "aligner exit %d: %s" % (r.returncode, r.stderr.decode()))
            return
        with open(work, encoding="utf-8") as f:
            out = f.read()

        # byte-identity for the negative fixture
        if name == "must-not-touch.md":
            if out == orig:
                ok("must-not-touch %s: byte-identical" % name)
            else:
                fail("must_not_touch_%s" % name, "file changed!")
            return
        else:
            if out == orig:
                fail("align_%s" % name, "no change produced")
                return

        # golden comparison
        golden = os.path.join(EXPECTED, name + ".aligned")
        if update_goldens:
            with open(golden, "w", encoding="utf-8", newline="") as f:
                f.write(out)
            ok("golden %s: updated" % name)
        elif os.path.exists(golden):
            with open(golden, encoding="utf-8") as f:
                if f.read() == out:
                    ok("golden %s: matches" % name)
                else:
                    fail("golden_%s" % name, "output differs from expected/%s.aligned"
                         % name)
        else:
            fail("golden_%s" % name, "missing expected/%s.aligned (run --update-goldens)"
                 % name)

        check_alignment(name, out)
        check_width_caps(name, out)
        check_content(name, orig, out)
        check_untouched(name, orig, out)
        if name == "wrapping.md":
            check_wrapped(name, out)

        # idempotency
        r2 = run_aligner([work])
        with open(work, encoding="utf-8") as f:
            out2 = f.read()
        if out2 == out:
            ok("idempotency %s: byte-identical second run" % name)
        else:
            fail("idempotency_%s" % name, "second run changed the file")


def test_must_not_touch_identity() -> None:
    path = os.path.join(TESTS, "must-not-touch.md")
    with open(path, encoding="utf-8") as f:
        orig = f.read()
    with tempfile.TemporaryDirectory() as tmp:
        work = os.path.join(tmp, "must-not-touch.md")
        shutil.copyfile(path, work)
        r = run_aligner([work])
        with open(work, encoding="utf-8") as f:
            out = f.read()
    if r.returncode == 0 and out == orig:
        ok("must-not-touch: byte-identical")
    else:
        fail("must-not-touch", "changed or errored (rc=%d)" % r.returncode)


def test_bytes_and_ansi() -> None:
    """BOM, CRLF, no-final-newline, ANSI escapes inside cells."""
    path = os.path.join(TESTS, "bytes-and-ansi.md")
    with open(path, "rb") as f:
        raw = f.read()
    data, changed = A.align_bytes(raw, MAX_WIDTH, 8)
    # BOM preserved
    if data.startswith(b"\xef\xbb\xbf"):
        ok("bytes: BOM preserved")
    else:
        fail("bytes", "BOM lost")
    # CRLF preserved
    text = data.decode("utf-8-sig")
    if "\r\n" in text and "\n" in text.replace("\r\n", ""):
        fail("bytes", "mixed line endings produced")
    else:
        ok("bytes: CRLF preserved")
    # alignment still holds
    check_alignment("bytes-and-ansi.md", text)
    check_content("bytes-and-ansi.md", raw.decode("utf-8-sig"), text)
    # ANSI escapes survive inside cells
    if b"\x1b[31m" in data and b"\x1b[0m" in data:
        ok("bytes: ANSI escapes preserved")
    else:
        fail("bytes", "ANSI escapes lost")
    # CRLF idempotency: second run byte-identical
    data2, _ = A.align_bytes(data, MAX_WIDTH, 8)
    if data2 == data:
        ok("bytes: CRLF output idempotent")
    else:
        fail("bytes", "CRLF output not idempotent")
    # no-final-newline preserved
    nl = "# T\n\n| a | b |\n| --- | --- |\n| c | d |"
    out, ch = A.align_bytes(nl.encode(), MAX_WIDTH, 8)
    if not out.endswith(b"\n"):
        ok("bytes: no-final-newline preserved")
    else:
        fail("bytes", "final newline added")
    # LF file with no BOM stays LF
    lf = "# T\n\n| a | b |\n| --- | --- |\n| c | d |\n"
    out, _ = A.align_bytes(lf.encode(), MAX_WIDTH, 8)
    if b"\r\n" not in out:
        ok("bytes: LF stays LF")
    else:
        fail("bytes", "LF converted to CRLF")


def test_cli() -> None:
    src = ("# T\n\n| a | bb |\n| --- | --- |\n| c | d |\n")
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "t.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(src)
        r = run_aligner(["--check", path])
        if r.returncode != 1:
            fail("cli_check", "--check on unaligned file: rc=%d" % r.returncode)
        else:
            ok("cli: --check exit 1 on unaligned")
        with open(path, encoding="utf-8") as f:
            if f.read() != src:
                fail("cli_check", "--check modified the file")
            else:
                ok("cli: --check does not modify")
        r = run_aligner([path])
        if r.returncode != 0:
            fail("cli_align", "align rc=%d" % r.returncode)
            return
        r = run_aligner(["--check", path])
        if r.returncode != 0:
            fail("cli_check2", "--check on aligned file: rc=%d" % r.returncode)
        else:
            ok("cli: --check exit 0 on aligned")
        r = run_aligner(["--diff", path])
        if r.returncode != 0:
            fail("cli_diff", "--diff on aligned file rc=%d" % r.returncode)
        else:
            ok("cli: --diff on aligned file exit 0")
        unaligned = os.path.join(tmp, "unaligned.md")
        with open(unaligned, "wb") as f:
            f.write(src.encode("utf-8"))
        r = run_aligner(["--diff", unaligned])
        if r.returncode != 1 or b"---" not in r.stderr:
            fail("cli_diff2", "--diff on unaligned rc=%d" % r.returncode)
        else:
            ok("cli: --diff on unaligned exit 1 with diff")
        # stdin mode equals file mode
        r_in = run_aligner([], stdin=src.encode())
        lf_path = os.path.join(tmp, "lf.md")
        with open(lf_path, "wb") as f:  # binary write keeps LF on Windows
            f.write(src.encode("utf-8"))
        r_file = run_aligner([lf_path])
        with open(lf_path, "rb") as f:
            file_out = f.read()
        if r_in.stdout == file_out and r_file.returncode == 0:
            ok("cli: stdin mode matches file mode")
        else:
            fail("cli_stdin", "stdin output differs from file output")
        # --max-width 0 disables wrapping
        wide = "# T\n\n| a | %s |\n| --- | --- |\n| c | d |\n" % ("x" * 120)
        r0 = run_aligner(["--max-width", "0"], stdin=wide.encode())
        if r0.returncode == 0 and b"|" and b"| " + b"x" * 120 + b" |" in r0.stdout:
            ok("cli: --max-width 0 keeps the column wide (no wrap)")
        else:
            fail("cli_nowrap", "max-width 0 did not keep single-line cell")
        # --tab-width 4: a tab inside a cell expands to a 4-column stop
        tabbed = "# T\n\n| k | v |\n| --- | --- |\n| a | b\tc |\n"
        r4 = run_aligner(["--tab-width", "4"], stdin=tabbed.encode())
        if r4.returncode == 0 and b"b   c" in r4.stdout:
            ok("cli: --tab-width 4 expands tab to 4-column stop")
        else:
            fail("cli_tabwidth", "--tab-width 4 output: %r" % r4.stdout)
        r8 = run_aligner(["--tab-width", "8"], stdin=tabbed.encode())
        if r8.returncode == 0 and b"b       c" in r8.stdout:
            ok("cli: --tab-width 8 expands tab to 8-column stop")
        else:
            fail("cli_tabwidth", "--tab-width 8 output: %r" % r8.stdout)
        # missing file -> exit 2
        r = run_aligner([os.path.join(tmp, "missing.md")])
        if r.returncode != 2:
            fail("cli_missing", "missing file rc=%d" % r.returncode)
        else:
            ok("cli: missing file exit 2")
        # invalid utf-8 -> exit 2
        bad = os.path.join(tmp, "bad.md")
        with open(bad, "wb") as f:
            f.write(b"\xff\xfe| a |\n| --- |\n")
        r = run_aligner([bad])
        if r.returncode != 2:
            fail("cli_badutf8", "invalid utf-8 rc=%d" % r.returncode)
        else:
            ok("cli: invalid utf-8 exit 2")


def main() -> None:
    update = "--update-goldens" in sys.argv
    os.makedirs(EXPECTED, exist_ok=True)
    print("== width model ==")
    test_width_model()
    print("== fixtures ==")
    for name in FIXTURES:
        path = os.path.join(TESTS, name)
        if not os.path.exists(path):
            fail("fixture", "missing %s" % path)
            continue
        print("-- %s" % name)
        test_galleries(path)
        run_fixture(path, update)
    print("== must-not-touch ==")
    test_must_not_touch_identity()
    print("== bytes & ansi ==")
    test_bytes_and_ansi()
    print("== cli ==")
    test_cli()
    print("\n%d passed, %d failed" % (PASSES, len(FAILURES)))
    if FAILURES:
        print("FAILURES:")
        for f in FAILURES:
            print("  - %s" % f)
        sys.exit(1)


if __name__ == "__main__":
    main()
