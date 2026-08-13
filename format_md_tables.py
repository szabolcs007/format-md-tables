#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""format_md_tables.py — realign the vertical borders of markdown tables.

Ensures that in a monospace renderer every ``|`` of a table sits at exactly
the same display column, regardless of CJK ideographs, fullwidth forms,
emoji ZWJ sequences, flags, skin-tone modifiers, keycaps, combining marks,
zero-width characters, tabs, or ANSI escape codes inside the cells.

Features
--------
* Width model matches modern terminals (Windows Terminal, kitty, wezterm):
  emoji sequences (ZWJ families, flags, skin tones, keycaps) count as a
  single double-width glyph; combining marks / variation selectors /
  zero-width joiners / ZWSP count as zero.
* Over-wide cells are wrapped into multiple physical lines at word
  boundaries so no column ever grows beyond ``--max-width`` (default 40)
  display columns.  The whole table stays a regular grid: continuation
  lines keep the same pipe positions, so horizontal and vertical borders
  remain aligned.  CJK text without spaces wraps per character; a single
  unbreakable token (e.g. a long URL) is hard-split at width with
  URL-friendly break points.
* Only real GFM tables are touched: a header row followed by a delimiter
  row whose cells are dashes (with optional colons) and that contains at
  least one pipe.  Everything else — fenced code blocks (including
  unterminated ones), indented code, paragraphs, HTML, headings, setext
  underlines — passes through byte-identical.
* Tables inside blockquotes (``> | a | b |``, nested ``> > ...``) are
  supported; the prefix is preserved.
* Leading/trailing pipe style is normalized to the header row's style
  (render-identical in GFM, and required for pixel-perfect alignment).
* Idempotent: running the tool twice produces byte-identical output.
* Preserves BOM, dominant line ending (LF or CRLF), and final-newline
  presence.

Usage
-----
    python format_md_tables.py [options] [file.md ...]
    python format_md_tables.py --check file.md        # exit 1 if it would change
    cat file.md | python format_md_tables.py          # stdin -> stdout

Options
-------
    --max-width N   wrap columns wider than N display columns (default 40;
                    0 disables wrapping entirely)
    --tab-width N   tab stop used when expanding tabs inside cells (default 8)
    --check         do not modify; exit 1 if any file would change
    --diff          print a unified diff to stderr and do not modify
    --version       print version and exit

Exit codes: 0 success/no changes, 1 changes needed (--check/--diff),
2 usage or I/O error.

Notes on multi-line (wrapped) rows
----------------------------------
A logical row may span several physical lines; continuation lines always
have an empty first cell.  On re-parse a line with an empty first cell is
treated as a continuation of the previous row only when that row's joined
content still exceeds ``--max-width`` (i.e. it genuinely had to wrap);
otherwise it is a fresh row.  Consequence: a hand-written row whose first
cell is empty AND that directly follows a row wider than ``--max-width``
is read as a continuation — separate such rows with a blank line.
Run with a consistent ``--max-width`` across runs.
"""

from __future__ import annotations

import argparse
import difflib
import os
import re
import sys
import tempfile
import unicodedata
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# Display width model
# ---------------------------------------------------------------------------

# Emoji_Presentation = Yes (Unicode 15.1): these codepoints render as a
# double-width emoji glyph by default even though their East Asian Width is
# Neutral.  Everything in 0x1F000..0x1FAFF is treated as emoji (2 wide).
EMOJI_PRESENTATION: List[Tuple[int, int]] = [
    (0x231A, 0x231B), (0x23E9, 0x23EC), (0x23F0, 0x23F0), (0x23F3, 0x23F3),
    (0x25FD, 0x25FE), (0x2614, 0x2615), (0x2648, 0x2653), (0x267F, 0x267F),
    (0x2693, 0x2693), (0x26A1, 0x26A1), (0x26AA, 0x26AB), (0x26BD, 0x26BE),
    (0x26C4, 0x26C5), (0x26CE, 0x26CE), (0x26D4, 0x26D4), (0x26EA, 0x26EA),
    (0x26F2, 0x26F3), (0x26F5, 0x26F5), (0x26FA, 0x26FA), (0x26FD, 0x26FD),
    (0x2705, 0x2705), (0x270A, 0x270B), (0x2728, 0x2728), (0x274C, 0x274C),
    (0x274E, 0x274E), (0x2753, 0x2755), (0x2757, 0x2757), (0x2795, 0x2797),
    (0x27B0, 0x27B0), (0x27BF, 0x27BF), (0x2B1B, 0x2B1C), (0x2B50, 0x2B50),
    (0x2B55, 0x2B55), (0x1F004, 0x1F004), (0x1F0CF, 0x1F0CF), (0x1F18E, 0x1F18E),
    (0x1F191, 0x1F19A), (0x1F1E6, 0x1F1FF), (0x1F201, 0x1F202), (0x1F21A, 0x1F21A),
    (0x1F22F, 0x1F22F), (0x1F232, 0x1F23A), (0x1F250, 0x1F251),
    (0x1F300, 0x1F320), (0x1F32D, 0x1F335), (0x1F337, 0x1F37C), (0x1F37E, 0x1F393),
    (0x1F3A0, 0x1F3CA), (0x1F3CF, 0x1F3D3), (0x1F3E0, 0x1F3F0), (0x1F3F4, 0x1F3F4),
    (0x1F3F8, 0x1F43E), (0x1F440, 0x1F440), (0x1F442, 0x1F4FC), (0x1F4FF, 0x1F53D),
    (0x1F54B, 0x1F54E), (0x1F550, 0x1F567), (0x1F57A, 0x1F57A),
    (0x1F595, 0x1F596), (0x1F5A4, 0x1F5A4), (0x1F5FB, 0x1F64F),
    (0x1F680, 0x1F6C5), (0x1F6CC, 0x1F6CC), (0x1F6D0, 0x1F6D2),
    (0x1F6D5, 0x1F6D7), (0x1F6DC, 0x1F6DF), (0x1F6EB, 0x1F6EC),
    (0x1F6F4, 0x1F6FC), (0x1F7E0, 0x1F7EB), (0x1F7F0, 0x1F7F0),
    (0x1F90C, 0x1F93A), (0x1F93C, 0x1F945), (0x1F947, 0x1F9FF),
    (0x1FA70, 0x1FA7C), (0x1FA80, 0x1FA88), (0x1FA90, 0x1FABD),
    (0x1FABF, 0x1FAC5), (0x1FACE, 0x1FADB), (0x1FAE0, 0x1FAE8),
    (0x1FAF0, 0x1FAF8),
]

# Emoji=Yes codepoints in the BMP symbols block (Unicode 15.1): these are
# text-presentation by default (1 column) but render 2 columns when followed
# by U+FE0F (VS16).  Used to gate the VS16 width promotion — a plain letter or
# space followed by VS16 must stay 1 column.
VS16_CAPABLE: List[Tuple[int, int]] = [
    (0x00A9, 0x00A9), (0x00AE, 0x00AE), (0x203C, 0x203C), (0x2049, 0x2049),
    (0x2122, 0x2122), (0x2139, 0x2139), (0x2194, 0x2199), (0x21A9, 0x21AA),
    (0x231A, 0x231B), (0x2328, 0x2328), (0x23CF, 0x23CF), (0x23E9, 0x23F3),
    (0x23F8, 0x23FA), (0x24C2, 0x24C2), (0x25AA, 0x25AB), (0x25B6, 0x25B6),
    (0x25C0, 0x25C0), (0x25FB, 0x25FE), (0x2600, 0x2604), (0x260E, 0x260E),
    (0x2611, 0x2611), (0x2614, 0x2615), (0x2618, 0x2618), (0x261D, 0x261D),
    (0x2620, 0x2620), (0x2622, 0x2623), (0x2626, 0x2626), (0x262A, 0x262A),
    (0x262E, 0x262F), (0x2638, 0x263A), (0x2640, 0x2640), (0x2642, 0x2642),
    (0x2648, 0x2653), (0x265F, 0x2660), (0x2663, 0x2663), (0x2665, 0x2666),
    (0x2668, 0x2668), (0x267B, 0x267B), (0x267E, 0x267F), (0x2692, 0x2697),
    (0x2699, 0x2699), (0x269B, 0x269C), (0x26A0, 0x26A1), (0x26A7, 0x26A7),
    (0x26AA, 0x26AB), (0x26B0, 0x26B1), (0x26BD, 0x26BE), (0x26C4, 0x26C5),
    (0x26C8, 0x26C8), (0x26CE, 0x26CF), (0x26D1, 0x26D1), (0x26D3, 0x26D4),
    (0x26E9, 0x26EA), (0x26F0, 0x26F5), (0x26F7, 0x26FA), (0x26FD, 0x26FD),
    (0x2702, 0x2702), (0x2705, 0x2705), (0x2708, 0x270D), (0x270F, 0x270F),
    (0x2712, 0x2712), (0x2714, 0x2714), (0x2716, 0x2716), (0x271D, 0x271D),
    (0x2721, 0x2721), (0x2728, 0x2728), (0x2733, 0x2734), (0x2744, 0x2744),
    (0x2747, 0x2747), (0x274C, 0x274C), (0x274E, 0x274E), (0x2753, 0x2755),
    (0x2757, 0x2757), (0x2763, 0x2764), (0x2795, 0x2797), (0x27A1, 0x27A1),
    (0x27B0, 0x27B0), (0x27BF, 0x27BF), (0x2934, 0x2935), (0x2B05, 0x2B07),
    (0x2B1B, 0x2B1C), (0x2B50, 0x2B50), (0x2B55, 0x2B55), (0x3030, 0x3030),
    (0x303D, 0x303D), (0x3297, 0x3297), (0x3299, 0x3299),
]

RI_LO, RI_HI = 0x1F1E6, 0x1F1FF          # regional indicators (flags)
SKIN_LO, SKIN_HI = 0x1F3FB, 0x1F3FF      # emoji skin-tone modifiers
ZWJ = 0x200D                             # zero-width joiner
VS16, VS15 = 0xFE0F, 0xFE0E              # variation selectors
KEYCAP = 0x20E3                          # combining enclosing keycap


def _in_ranges(cp: int, ranges: List[Tuple[int, int]]) -> bool:
    for lo, hi in ranges:
        if lo <= cp <= hi:
            return True
    return False


def _is_emoji_base(cp: int) -> bool:
    return 0x1F000 <= cp <= 0x1FAFF or _in_ranges(cp, EMOJI_PRESENTATION)


def _char_base_width(cp: int) -> int:
    """Width of a base (non-modifier) codepoint: 2 for emoji/wide, else 1."""
    if _is_emoji_base(cp):
        return 2
    if unicodedata.east_asian_width(chr(cp)) in ("W", "F"):
        return 2
    return 1


def display_width(text: str, tab_width: int = 8) -> int:
    """Display width of ``text`` in monospace terminal columns.

    Cluster-aware: a base character plus its combining marks, variation
    selectors, skin-tone modifiers, keycap, and ZWJ-joined members form one
    glyph.  Emoji clusters are 2 wide, text clusters keep their base width.
    Regional indicators are consumed in pairs (one flag = 2 wide).
    ANSI escape sequences count zero width.
    """
    # Strip ANSI escapes first (they are zero width in terminals)
    text = ANSI_RE.sub("", text)
    width = 0
    i = 0
    n = len(text)
    while i < n:
        cp = ord(text[i])
        if cp == 0x09:                                   # tab -> next tab stop
            width += tab_width - (width % tab_width)
            i += 1
            continue
        cat = unicodedata.category(text[i])
        if cat in ("Mn", "Mc", "Me", "Zl", "Zp"):              # combining / line sep
            i += 1
            continue
        if cat == "Cf":                                  # format chars
            if cp == ZWJ:
                # A ZWJ reached here was not consumed by a preceding base.
                # Treat it as zero-width; the next character keeps its own
                # width (a following emoji is a standalone 2-wide glyph,
                # a following zero-width char adds nothing).
                j = i + 1
                if j < n:
                    nxt_cat = unicodedata.category(text[j])
                    if _is_emoji_base(ord(text[j])):
                        width += 2
                        i = j + 1
                    elif nxt_cat in ("Mn", "Mc", "Me", "Cf", "Cc", "Zl", "Zp"):
                        i += 1
                    else:
                        width += _char_base_width(ord(text[j]))
                        i = j + 1
                else:
                    i += 1
                continue
            # other Cf (VS, ZWSP, etc.) are zero width
            i += 1
            continue
        if cat == "Cc":                                  # control
            i += 1
            continue
        if RI_LO <= cp <= RI_HI:                         # flag pair
            if i + 1 < n and RI_LO <= ord(text[i + 1]) <= RI_HI:
                width += 2
                i += 2
            else:
                width += 2
                i += 1
            continue
        base_w = _char_base_width(cp)
        has_vs16 = False
        has_vs15 = False
        has_keycap = False
        extra = 0
        is_emoji_base = _is_emoji_base(cp)
        vs_capable = is_emoji_base or _in_ranges(cp, VS16_CAPABLE)
        j = i + 1
        while j < n:                                     # consume modifiers
            cj = ord(text[j])
            catj = unicodedata.category(text[j])
            if catj in ("Mn", "Mc", "Me"):
                if cj == VS16:
                    has_vs16 = True
                if cj == VS15:
                    has_vs15 = True
                if cj == KEYCAP:
                    has_keycap = True
                j += 1
            elif catj == "Cf":
                if cj == VS16:
                    has_vs16 = True
                if cj == VS15:
                    has_vs15 = True
                if cj == KEYCAP:
                    has_keycap = True
                if cj == ZWJ and is_emoji_base:
                    # ZWJ joins the next base into this cluster
                    j += 1
                    if j < n and _is_emoji_base(ord(text[j])):
                        # next base is emoji -> cluster stays 2-wide (no extra width)
                        j += 1
                    elif j < n:
                        nxt_catj = unicodedata.category(text[j])
                        if nxt_catj not in ("Mn", "Mc", "Me", "Cf", "Cc", "Zl", "Zp"):
                            extra += _char_base_width(ord(text[j]))
                        j += 1
                else:
                    j += 1
            elif SKIN_LO <= cj <= SKIN_HI and is_emoji_base:
                j += 1
            else:
                break
        i = j
        if has_keycap:
            width += 2
        elif has_vs15 and vs_capable:
            width += 1                     # text presentation forced
        elif has_vs16 and vs_capable:
            width += 2                     # emoji presentation forced
        else:
            width += base_w + extra
    return width


def expand_tabs(text: str, tab_width: int = 8) -> str:
    """Expand tabs to spaces using display-column tab stops."""
    if "\t" not in text:
        return text
    out: List[str] = []
    col = 0
    for ch in text:
        if ch == "\t":
            pad = tab_width - (col % tab_width)
            out.append(" " * pad)
            col += pad
        else:
            out.append(ch)
            col += display_width(ch)
    return "".join(out)


# ---------------------------------------------------------------------------
# Tokenization (ANSI-aware)
# ---------------------------------------------------------------------------

ANSI_RE = re.compile(
    r"\x1b\[[0-9;:?]*[ -/]*[@-~]"      # CSI sequences (SGR, cursor moves...)
    r"|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)"  # OSC sequences
    r"|\x1b[()][0-9A-Za-z]"            # charset designators
    r"|\x1b"                            # lone ESC
)


def tokenize(text: str) -> List[Tuple[str, str]]:
    """Split into ('ansi' | 'plain', text) pieces; ansi pieces are zero-width."""
    pieces: List[Tuple[str, str]] = []
    pos = 0
    for m in ANSI_RE.finditer(text):
        if m.start() > pos:
            pieces.append(("plain", text[pos:m.start()]))
        pieces.append(("ansi", m.group()))
        pos = m.end()
    if pos < len(text):
        pieces.append(("plain", text[pos:]))
    return pieces


def piece_width(piece: Tuple[str, str]) -> int:
    return 0 if piece[0] == "ansi" else display_width(piece[1])


# ---------------------------------------------------------------------------
# Wrapping
# ---------------------------------------------------------------------------

PREFERRED_BREAK = set("/?&=._-,;:")


def _split_word(word: str, max_width: int) -> List[str]:
    """Hard-split one unbreakable token into chunks of <= max_width columns.

    Prefers cutting after URL-friendly punctuation; falls back to exact
    display-width chunks (which yields per-character wrapping for CJK).
    """
    if display_width(word) <= max_width:
        return [word]
    chunks: List[str] = []
    pos = 0
    while pos < len(word):
        w = 0
        end = pos
        last_pref = -1
        k = pos
        while k < len(word):
            cw = display_width(word[k])
            if w + cw > max_width:
                break
            w += cw
            end = k
            if word[k] in PREFERRED_BREAK:
                last_pref = k
            k += 1
        if last_pref > pos and display_width(word[pos:last_pref + 1]) >= max_width * 0.5:
            cut = last_pref + 1
        else:
            cut = end + 1 if end > pos else pos + 1  # always make progress
        chunks.append(word[pos:cut])
        pos = cut
    return chunks


def _hard_split_item(item: dict, max_width: int) -> List[dict]:
    """Split an over-long word item into chunk items, keeping ANSI styling."""
    pieces = item["pieces"]
    plain_idx = next((i for i, p in enumerate(pieces) if p[0] == "plain"), None)
    if plain_idx is None:
        return [item]  # degenerate all-ANSI item: nothing to split
    word = pieces[plain_idx][1]
    chunks = _split_word(word, max_width)
    out = []
    for ch in chunks:
        new_pieces = pieces[:plain_idx] + [("plain", ch)] + pieces[plain_idx + 1:]
        out.append({"pieces": new_pieces, "width": display_width(ch)})
    return out


def wrap_cell(text: str, max_width: int) -> List[str]:
    """Wrap cell text into fragments, each <= ``max_width`` display columns.

    Wraps at word boundaries (words joined with a single space; whitespace
    runs at break points collapse to one space).  Unbreakable tokens wider
    than ``max_width`` are hard-split.  ANSI escapes stay attached to their
    text and are repeated on hard-split chunks so styling survives.
    """
    if display_width(text) <= max_width:
        return [text]
    items: List[dict] = []          # words/ansi: {'pieces': [...], 'width': int}
    cur: List[Tuple[str, str]] = []  # pending ansi pieces
    gap = 1                          # spaces before the next word
    for kind, s in tokenize(text):
        if kind == "ansi":
            cur.append((kind, s))
            continue
        for m in re.finditer(r"\s+|\S+", s):
            part = m.group()
            if part.isspace():
                if cur and items:
                    # ANSI between words: emit it as its own zero-width item
                    # so the spaces on BOTH sides survive.
                    items.append({"pieces": cur, "width": 0})
                    cur = []
                gap += len(part)
                continue
            if items and gap == 0 and cur:
                # ANSI code sits *inside* a word (no whitespace on either
                # side): merge into the previous word instead of starting a
                # new one, so wrapping never inserts a spurious space.
                items[-1]["pieces"] = items[-1]["pieces"] + cur + [("plain", part)]
                items[-1]["width"] = display_width(
                    "".join(p[1] for p in items[-1]["pieces"]))
                cur = []
                continue
            items.append({"pieces": cur + [("plain", part)],
                          "width": display_width(part)})
            cur = []
            gap = 0
    if cur and items:                          # trailing ansi: keep with last word
        items[-1]["pieces"] = items[-1]["pieces"] + cur

    fragments: List[List[dict]] = []
    cur_frag: List[dict] = []
    cur_w = 0
    for it in items:
        add = it["width"] if not cur_frag else it["width"] + 1
        if cur_w + add <= max_width:
            cur_frag.append(it)
            cur_w += add
        else:
            if cur_frag:
                fragments.append(cur_frag)
            if it["width"] <= max_width:
                cur_frag = [it]
                cur_w = it["width"]
            else:
                chunks = _hard_split_item(it, max_width)
                for ch in chunks[:-1]:
                    fragments.append([ch])
                cur_frag = [chunks[-1]]
                cur_w = chunks[-1]["width"]
    if cur_frag:
        fragments.append(cur_frag)
    out = []
    for frag in fragments:
        parts = []
        for it in frag:
            if parts:                     # one space between words
                parts.append(" ")
            parts.append("".join(p[1] for p in it["pieces"]))
        out.append("".join(parts))
    return out


# ---------------------------------------------------------------------------
# Table parsing
# ---------------------------------------------------------------------------

PREFIX_RE = re.compile(r"^(?P<prefix> {0,3}(?:> ?)*)(?P<body>.*)$")
# Lines starting like this are block-level elements -> they end a table.
BLOCK_START_RE = re.compile(
    r"^(#{1,6}\s|>|[-+*]\s|\d+[.)]\s|```|~~~|<[a-zA-Z]|<!--)")
HR_RE = re.compile(r"^(-{3,}|_{3,}|\*{3,})\s*$")
FENCE_OPEN_RE = re.compile(r"^ {0,3}(?:> ?)*(`{3,}|~{3,})")
MATH_OPEN_RE = re.compile(r"^ {0,3}\$\$\s*$")
# CommonMark raw HTML block: an opening tag / comment / declaration at the
# start of a line runs until the first blank line.  Content inside it (even
# table-shaped lines) must never be touched.
HTML_BLOCK_RE = re.compile(r"^ {0,3}<[a-zA-Z!/?]")


def split_row(line: str) -> List[str]:
    """Split a row body into cells.

    A ``|`` delimits cells unless it is backslash-escaped (``\\|``) or sits
    inside an inline code span (`` `a|b` ``).  Matching follows GFM: a code
    span opens with a backtick run and closes with a run of the same length.
    """
    cells: List[str] = []
    cur: List[str] = []
    i = 0
    n = len(line)
    code_len = 0
    while i < n:
        c = line[i]
        if c == "\\" and i + 1 < n:
            cur.append(line[i:i + 2])
            i += 2
            continue
        if c == "`":
            j = i
            while j < n and line[j] == "`":
                j += 1
            run = j - i
            if code_len == 0:
                code_len = run
                cur.append(line[i:j])
            elif run == code_len:
                code_len = 0
                cur.append(line[i:j])
            else:
                cur.append(line[i:j])
            i = j
            continue
        if c == "|" and code_len == 0:
            cells.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(c)
        i += 1
    cells.append("".join(cur))
    return cells


def parse_row_body(body: str) -> Tuple[List[str], bool, bool]:
    """Parse a row line body.  Returns (cells, has_leading_pipe, has_trailing_pipe).

    Follows GFM: one optional leading pipe and one optional trailing pipe are
    stripped; the remainder is split on cell-delimiting pipes.
    Cell content is trimmed of leading/trailing whitespace (per GFM).
    """
    has_lead = body.startswith("|")
    has_trail = body.endswith("|")
    inner = body[1:] if has_lead else body
    if has_trail:
        inner = inner[:-1]
    cells = [c.strip() for c in split_row(inner)]
    return cells, has_lead, has_trail


def parse_delim_cell(cell: str) -> Optional[str]:
    """Map a delimiter cell to alignment: 'l', 'r', 'c', 'n' or None."""
    s = cell.strip()
    if not re.fullmatch(r":?-+:?", s):
        return None
    left = s.startswith(":")
    right = s.endswith(":")
    if left and right:
        return "c"
    if right:
        return "r"
    if left:
        return "l"
    return "n"


def is_delimiter_row(body: str) -> bool:
    """True when ``body`` is a GFM delimiter row (dashes + optional colons).

    The row must contain at least one pipe; a bare ``---`` line is a setext
    heading underline or thematic break and is never treated as a table.
    """
    if "|" not in body:
        return False
    cells, _, _ = parse_row_body(body)
    if not cells:
        return False
    for c in cells:
        if parse_delim_cell(c) is None:
            return False
    return True


def _norm_prefix(prefix: str) -> str:
    return re.sub(r"> ?", ">", prefix)


@dataclass
class Row:
    cells: List[List[str]] = field(default_factory=list)  # per cell: fragments


@dataclass
class Table:
    prefix: str
    lead: bool
    trail: bool
    ncols: int
    header: List[List[str]]            # fragments per header cell
    aligns: List[str]
    sep_cells: List[str]               # raw delimiter cells
    rows: List[Row]
    wrap_width: int
    warnings: List[str] = field(default_factory=list)


def _merge_continuations(rows: List[Row], wrap_width: int) -> List[Row]:
    """Fold multi-line (wrapped) rows back together.

    A line whose first cell is empty is a continuation candidate.  A run of
    candidates is merged; if the merged row's joined content still exceeds
    ``wrap_width`` the merge stands (the row genuinely wrapped), otherwise
    the candidates were fresh rows and the merge is undone.  With
    ``wrap_width == 0`` (no wrapping) nothing is ever merged.
    """
    result: List[Row] = []
    i = 0
    n = len(rows)
    while i < n:
        row = rows[i]
        j = i + 1
        merged: Optional[Row] = None
        while j < n and rows[j].cells and rows[j].cells[0] == [""]:
            if merged is None:
                merged = Row([list(c) for c in row.cells])
            cand = rows[j]
            for k in range(len(merged.cells)):
                if cand.cells[k] != [""]:
                    merged.cells[k].append(cand.cells[k][0])
            j += 1
        if merged is not None:
            maxw = max(display_width(" ".join(c)) for c in merged.cells)
            if wrap_width and maxw > wrap_width:
                result.append(merged)
                i = j
                continue
            # wrong merge: keep the row, re-examine candidates as fresh rows
            result.append(row)
            i += 1
            continue
        result.append(row)
        i += 1
    return result


def collect_table(lines: List[str], i: int, wrap_width: int,
                  tab_width: int) -> Optional[Tuple[Table, int]]:
    """Collect the table starting at line ``i``; returns (table, next_index)."""
    m0 = PREFIX_RE.match(lines[i])
    m1 = PREFIX_RE.match(lines[i + 1])
    if m0 is None or m1 is None:
        return None
    prefix0 = m0.group("prefix")
    body0 = m0.group("body").rstrip()
    body1 = m1.group("body").rstrip()
    if not body0 or not is_delimiter_row(body1):
        return None
    header_cells, lead, trail = parse_row_body(body0)
    delim_cells, _, _ = parse_row_body(body1)
    # Tabs expand relative to the cell's own start (the column a tab stop
    # lands on depends on the cell content, not the raw line position).
    header_cells = [expand_tabs(cell, tab_width) for cell in header_cells]
    delim_cells = [expand_tabs(cell, tab_width) for cell in delim_cells]
    aligns: List[str] = []
    for c in delim_cells:
        a = parse_delim_cell(c)
        if a is None:
            return None
        aligns.append(a)
    ncols = len(aligns)
    if ncols == 0:
        return None
    # GFM: the header row must have exactly as many cells as the delimiter
    # row; a mismatch means this is not a table (e.g. `a | b` + `---` is a
    # setext heading) and the lines must pass through untouched.
    if len(header_cells) != ncols:
        return None
    warnings: List[str] = []
    header = [[c] for c in header_cells]

    rows: List[Row] = []
    j = i + 2
    while j < len(lines):
        line = lines[j]
        if not line.strip():
            break
        m = PREFIX_RE.match(line)
        if m is None or _norm_prefix(m.group("prefix")) != _norm_prefix(prefix0):
            break
        body = m.group("body").rstrip()
        if not body:
            break
        if BLOCK_START_RE.match(body) or HR_RE.match(body):
            break
        if ncols > 1 and "|" not in body:
            break
        cells, _, _ = parse_row_body(body)
        cells = [expand_tabs(cell, tab_width) for cell in cells]
        if len(cells) > ncols:
            warnings.append(
                "row %d has %d cells but table has %d column(s); extra cell(s) dropped"
                % (j + 1, len(cells), ncols))
        cells = (cells + [""] * ncols)[:ncols]
        rows.append(Row([[c] for c in cells]))
        j += 1
    rows = _merge_continuations(rows, wrap_width)
    return Table(prefix0, lead, trail, ncols, header, aligns, delim_cells, rows,
                 wrap_width, warnings), j


def _pad(frag: str, width: int) -> str:
    return frag + " " * (width - display_width(frag))


def _render_row(cells: List[List[str]], widths: List[int], lead: bool, trail: bool,
                wrap_width: int, prefix: str) -> List[str]:
    """Render one logical row; returns one string per physical line."""
    frags_per_cell: List[List[str]] = []
    height = 1
    for j, frags in enumerate(cells):
        if not frags:
            frags = [""]
        elif j > 0:
            # Wrap every fragment that exceeds the column width, even inside
            # multi-fragment (previously wrapped/merged) cells.  Column 0 is
            # never wrapped (see render_table).
            wrapped: List[str] = []
            for frag in frags:
                if display_width(frag) > widths[j]:
                    wrapped.extend(wrap_cell(frag, widths[j]))
                else:
                    wrapped.append(frag)
            frags = wrapped
        frags_per_cell.append(frags)
        height = max(height, len(frags))
    parts: List[str] = []
    for k in range(height):
        row_parts = []
        for j in range(len(frags_per_cell)):
            frag = frags_per_cell[j][k] if k < len(frags_per_cell[j]) else ""
            row_parts.append(_pad(frag, widths[j]))
        body = " | ".join(row_parts)
        if lead:
            body = "| " + body
        if trail:
            body += " |"
        parts.append(prefix + body)
    return parts


def _render_sep(aligns: List[str], widths: List[int], lead: bool, trail: bool,
                prefix: str) -> str:
    parts = []
    for a, w in zip(aligns, widths):
        if a == "l":
            cell = ":" + "-" * (w - 1)
        elif a == "r":
            cell = "-" * (w - 1) + ":"
        elif a == "c":
            cell = ":" + "-" * (w - 2) + ":"
        else:
            cell = "-" * w
        parts.append(cell)
    body = " | ".join(parts)
    if lead:
        body = "| " + body
    if trail:
        body += " |"
    return prefix + body


def render_table(t: Table) -> List[str]:
    # Column 0 never wraps, and single-column tables never wrap: a wrapped
    # cell's continuation line would put content in the first cell, making it
    # indistinguishable from a fresh row on re-parse (and in any GFM
    # renderer), silently changing the row count.  Wrapping later columns
    # always produces continuations with an empty first cell, which the
    # merge logic recognises.
    wrap = t.wrap_width if t.ncols > 1 else 0
    widths: List[int] = []
    for j in range(t.ncols):
        cw = 0
        for row in t.rows:
            cw = max(cw, display_width(" ".join(row.cells[j])))
        for cell in t.header:
            cw = max(cw, display_width(" ".join(cell)))
        if j < len(t.sep_cells):
            cw = max(cw, display_width(t.sep_cells[j]))
        if wrap and j > 0:
            cw = min(cw, wrap)
        widths.append(max(3, cw))
    out: List[str] = []
    out.extend(_render_row(t.header, widths, t.lead, t.trail, t.wrap_width, t.prefix))
    out.append(_render_sep(t.aligns, widths, t.lead, t.trail, t.prefix))
    for row in t.rows:
        out.extend(_render_row(row.cells, widths, t.lead, t.trail, t.wrap_width, t.prefix))
    return out


def find_tables(lines: List[str], wrap_width: int,
                tab_width: int) -> List[Tuple[int, int, Table]]:
    """Locate all tables; returns (start_line, end_line, Table) in line order."""
    tables: List[Tuple[int, int, Table]] = []
    i = 0
    n = len(lines)
    fence: Optional[Tuple[str, int]] = None
    while i < n:
        line = lines[i]
        if fence is not None:
            ch, flen = fence
            if re.match(r"^ {0,3}(?:> ?)*" + re.escape(ch) + r"{" + str(flen)
                        + r",}[ \t]*$", line):
                fence = None
            i += 1
            continue
        if MATH_OPEN_RE.match(line):
            i += 1
            while i < n and not MATH_OPEN_RE.match(lines[i]):
                i += 1
            if i < n:
                i += 1  # skip the closing $$
            continue
        if HTML_BLOCK_RE.match(line):
            i += 1
            while i < n and lines[i].strip():
                i += 1
            continue
        mf = FENCE_OPEN_RE.match(line)
        if mf:
            fence = (mf.group(1)[0], len(mf.group(1)))
            i += 1
            continue
        if line.strip() and i + 1 < n:
            found = collect_table(lines, i, wrap_width, tab_width)
            if found is not None:
                t, j = found
                tables.append((i, j, t))
                i = j
                continue
        i += 1
    return tables


# ---------------------------------------------------------------------------
# Whole-text / file processing
# ---------------------------------------------------------------------------

def align_text(text: str, wrap_width: int = 40, tab_width: int = 8,
               warnings: Optional[List[str]] = None) -> Tuple[str, bool]:
    """Align every table in ``text``; returns (new_text, changed)."""
    wlist: List[str] = [] if warnings is None else warnings
    bom = text.startswith("\ufeff")
    if bom:
        text = text[1:]
    crlf = text.count("\r\n")
    lf = text.count("\n") - crlf
    eol = "\r\n" if crlf > lf else "\n"

    lines = [line.rstrip("\r") for line in text.split("\n")]
    tables = find_tables(lines, wrap_width, tab_width)
    if not tables:
        return ("\ufeff" if bom else "") + text, False

    new_lines = list(lines)
    offset = 0
    for start, end, t in tables:
        rendered = render_table(t)
        new_lines[start + offset:end + offset] = rendered
        offset += len(rendered) - (end - start)
        if t.warnings:
            wlist.append("format_md_tables: table at line %d: %s"
                         % (start + 1, "; ".join(t.warnings)))
    out = eol.join(new_lines)
    if bom:
        out = "\ufeff" + out
    return out, out != text


def _read(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def _write(path: str, data: bytes) -> None:
    """Write ``data`` to ``path`` atomically (temp file + os.replace)."""
    dirname = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp = tempfile.mkstemp(dir=dirname, prefix=".fmt_md_tables-",
                               suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def align_bytes(raw: bytes, wrap_width: int, tab_width: int,
                warnings: Optional[List[str]] = None) -> Tuple[bytes, bool]:
    had_bom = raw.startswith(b"\xef\xbb\xbf")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("not valid UTF-8")
    new_text, changed = align_text(text, wrap_width, tab_width, warnings)
    data = new_text.encode("utf-8")
    if had_bom and not data.startswith(b"\xef\xbb\xbf"):
        data = b"\xef\xbb\xbf" + data
    return data, changed


def align_file(path: str, wrap_width: int, tab_width: int,
               warnings: Optional[List[str]] = None) -> bool:
    raw = _read(path)
    data, changed = align_bytes(raw, wrap_width, tab_width, warnings)
    if changed:
        _write(path, data)
    return changed


def _diff(old: str, new: str, path: str) -> str:
    return "".join(difflib.unified_diff(
        old.splitlines(keepends=True), new.splitlines(keepends=True),
        fromfile=path, tofile=path + " (aligned)", lineterm=""))


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="format_md_tables",
        description="Realign the vertical borders of markdown tables so every "
                    "| lines up exactly in a monospace renderer, accounting for "
                    "wide characters, emoji, combining marks and ANSI codes, and "
                    "wrapping over-wide cells at word boundaries.",
        epilog="With no file arguments the input is read from stdin and the "
               "aligned result is written to stdout.")
    parser.add_argument("files", nargs="*", metavar="FILE",
                        help="markdown files to align in place")
    parser.add_argument("--max-width", type=int, default=40, metavar="N",
                        help="wrap columns wider than N display columns "
                             "(default 40; 0 disables wrapping)")
    parser.add_argument("--tab-width", type=int, default=8, metavar="N",
                        help="tab stop used when expanding tabs inside cells "
                             "(default 8)")
    parser.add_argument("--check", action="store_true",
                        help="do not modify files; exit 1 if any would change")
    parser.add_argument("--diff", action="store_true",
                        help="print a unified diff to stderr and do not modify")
    parser.add_argument("--version", action="version",
                        version="format_md_tables " + VERSION)
    args = parser.parse_args(argv)

    if args.max_width < 0:
        parser.error("--max-width must be >= 0")
    if args.tab_width < 1:
        parser.error("--tab-width must be >= 1")

    warnings: List[str] = []
    changed_any = False
    errors = 0

    if not args.files:
        raw = sys.stdin.buffer.read()
        try:
            data, changed = align_bytes(raw, args.max_width, args.tab_width,
                                        warnings)
        except ValueError as e:
            print("format_md_tables: stdin: %s" % e, file=sys.stderr)
            return 2
        if args.diff:
            sys.stderr.write(_diff(raw.decode("utf-8-sig", "replace"),
                                   data.decode("utf-8-sig", "replace"),
                                   "<stdin>"))
        if not (args.check or args.diff):
            sys.stdout.buffer.write(data)
        if changed:
            changed_any = True
            if args.check and not args.diff:
                print("format_md_tables: <stdin> would be reformatted",
                      file=sys.stderr)
    else:
        for path in args.files:
            try:
                raw = _read(path)
            except OSError as e:
                print("format_md_tables: %s: %s" % (path, e), file=sys.stderr)
                errors += 1
                continue
            try:
                data, changed = align_bytes(raw, args.max_width, args.tab_width,
                                            warnings)
            except ValueError as e:
                print("format_md_tables: %s: %s" % (path, e), file=sys.stderr)
                errors += 1
                continue
            if changed:
                changed_any = True
                if args.diff:
                    sys.stderr.write(_diff(raw.decode("utf-8-sig", "replace"),
                                           data.decode("utf-8-sig", "replace"),
                                           path))
                elif args.check:
                    print("format_md_tables: %s would be reformatted" % path,
                          file=sys.stderr)
                else:
                    try:
                        _write(path, data)
                    except OSError as e:
                        print("format_md_tables: %s: %s" % (path, e),
                              file=sys.stderr)
                        errors += 1

    for w in warnings:
        print(w, file=sys.stderr)
    if errors:
        return 2
    if changed_any and (args.check or args.diff):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
