// format_md_tables.ts — realign the vertical borders of markdown tables.
//
// TypeScript port of format_md_tables.py, behavior-identical: same output
// bytes, same exit codes (0 = ok/no change, 1 = change needed under
// --check/--diff, 2 = usage/IO error), same messages.
//
// Ensures that in a monospace renderer every `|` of a table sits at exactly
// the same display column, regardless of CJK ideographs, fullwidth forms,
// emoji ZWJ sequences, flags, skin-tone modifiers, keycaps, combining marks,
// zero-width characters, tabs, or ANSI escape codes inside the cells.
//
// Width iteration is code-point-driven (Array.from), never UTF-16-unit;
// regex-driven slicing uses the original JS string with match indices.

export const VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Display width model
// ---------------------------------------------------------------------------

export type Ranges = Array<[number, number]>;

// Emoji_Presentation = Yes (Unicode 15.1): these codepoints render as a
// double-width emoji glyph by default even though their East Asian Width is
// Neutral.  Everything in 0x1F000..0x1FAFF is treated as emoji (2 wide).
export const EMOJI_PRESENTATION: Ranges = [
  [0x231A, 0x231B], [0x23E9, 0x23EC], [0x23F0, 0x23F0], [0x23F3, 0x23F3],
  [0x25FD, 0x25FE], [0x2614, 0x2615], [0x2648, 0x2653], [0x267F, 0x267F],
  [0x2693, 0x2693], [0x26A1, 0x26A1], [0x26AA, 0x26AB], [0x26BD, 0x26BE],
  [0x26C4, 0x26C5], [0x26CE, 0x26CE], [0x26D4, 0x26D4], [0x26EA, 0x26EA],
  [0x26F2, 0x26F3], [0x26F5, 0x26F5], [0x26FA, 0x26FA], [0x26FD, 0x26FD],
  [0x2705, 0x2705], [0x270A, 0x270B], [0x2728, 0x2728], [0x274C, 0x274C],
  [0x274E, 0x274E], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27B0, 0x27B0], [0x27BF, 0x27BF], [0x2B1B, 0x2B1C], [0x2B50, 0x2B50],
  [0x2B55, 0x2B55], [0x1F004, 0x1F004], [0x1F0CF, 0x1F0CF], [0x1F18E, 0x1F18E],
  [0x1F191, 0x1F19A], [0x1F1E6, 0x1F1FF], [0x1F201, 0x1F202], [0x1F21A, 0x1F21A],
  [0x1F22F, 0x1F22F], [0x1F232, 0x1F23A], [0x1F250, 0x1F251],
  [0x1F300, 0x1F320], [0x1F32D, 0x1F335], [0x1F337, 0x1F37C], [0x1F37E, 0x1F393],
  [0x1F3A0, 0x1F3CA], [0x1F3CF, 0x1F3D3], [0x1F3E0, 0x1F3F0], [0x1F3F4, 0x1F3F4],
  [0x1F3F8, 0x1F43E], [0x1F440, 0x1F440], [0x1F442, 0x1F4FC], [0x1F4FF, 0x1F53D],
  [0x1F54B, 0x1F54E], [0x1F550, 0x1F567], [0x1F57A, 0x1F57A],
  [0x1F595, 0x1F596], [0x1F5A4, 0x1F5A4], [0x1F5FB, 0x1F64F],
  [0x1F680, 0x1F6C5], [0x1F6CC, 0x1F6CC], [0x1F6D0, 0x1F6D2],
  [0x1F6D5, 0x1F6D7], [0x1F6DC, 0x1F6DF], [0x1F6EB, 0x1F6EC],
  [0x1F6F4, 0x1F6FC], [0x1F7E0, 0x1F7EB], [0x1F7F0, 0x1F7F0],
  [0x1F90C, 0x1F93A], [0x1F93C, 0x1F945], [0x1F947, 0x1F9FF],
  [0x1FA70, 0x1FA7C], [0x1FA80, 0x1FA88], [0x1FA90, 0x1FABD],
  [0x1FABF, 0x1FAC5], [0x1FACE, 0x1FADB], [0x1FAE0, 0x1FAE8],
  [0x1FAF0, 0x1FAF8],
];

// Emoji=Yes codepoints in the BMP symbols block (Unicode 15.1): these are
// text-presentation by default (1 column) but render 2 columns when followed
// by U+FE0F (VS16).  Used to gate the VS16 width promotion — a plain letter or
// space followed by VS16 must stay 1 column.
export const VS16_CAPABLE: Ranges = [
  [0x00A9, 0x00A9], [0x00AE, 0x00AE], [0x203C, 0x203C], [0x2049, 0x2049],
  [0x2122, 0x2122], [0x2139, 0x2139], [0x2194, 0x2199], [0x21A9, 0x21AA],
  [0x231A, 0x231B], [0x2328, 0x2328], [0x23CF, 0x23CF], [0x23E9, 0x23F3],
  [0x23F8, 0x23FA], [0x24C2, 0x24C2], [0x25AA, 0x25AB], [0x25B6, 0x25B6],
  [0x25C0, 0x25C0], [0x25FB, 0x25FE], [0x2600, 0x2604], [0x260E, 0x260E],
  [0x2611, 0x2611], [0x2614, 0x2615], [0x2618, 0x2618], [0x261D, 0x261D],
  [0x2620, 0x2620], [0x2622, 0x2623], [0x2626, 0x2626], [0x262A, 0x262A],
  [0x262E, 0x262F], [0x2638, 0x263A], [0x2640, 0x2640], [0x2642, 0x2642],
  [0x2648, 0x2653], [0x265F, 0x2660], [0x2663, 0x2663], [0x2665, 0x2666],
  [0x2668, 0x2668], [0x267B, 0x267B], [0x267E, 0x267F], [0x2692, 0x2697],
  [0x2699, 0x2699], [0x269B, 0x269C], [0x26A0, 0x26A1], [0x26A7, 0x26A7],
  [0x26AA, 0x26AB], [0x26B0, 0x26B1], [0x26BD, 0x26BE], [0x26C4, 0x26C5],
  [0x26C8, 0x26C8], [0x26CE, 0x26CF], [0x26D1, 0x26D1], [0x26D3, 0x26D4],
  [0x26E9, 0x26EA], [0x26F0, 0x26F5], [0x26F7, 0x26FA], [0x26FD, 0x26FD],
  [0x2702, 0x2702], [0x2705, 0x2705], [0x2708, 0x270D], [0x270F, 0x270F],
  [0x2712, 0x2712], [0x2714, 0x2714], [0x2716, 0x2716], [0x271D, 0x271D],
  [0x2721, 0x2721], [0x2728, 0x2728], [0x2733, 0x2734], [0x2744, 0x2744],
  [0x2747, 0x2747], [0x274C, 0x274C], [0x274E, 0x274E], [0x2753, 0x2755],
  [0x2757, 0x2757], [0x2763, 0x2764], [0x2795, 0x2797], [0x27A1, 0x27A1],
  [0x27B0, 0x27B0], [0x27BF, 0x27BF], [0x2934, 0x2935], [0x2B05, 0x2B07],
  [0x2B1B, 0x2B1C], [0x2B50, 0x2B50], [0x2B55, 0x2B55], [0x3030, 0x3030],
  [0x303D, 0x303D], [0x3297, 0x3297], [0x3299, 0x3299],
];

export const RI_LO = 0x1F1E6;        // regional indicators (flags)
export const RI_HI = 0x1F1FF;
export const SKIN_LO = 0x1F3FB;      // emoji skin-tone modifiers
export const SKIN_HI = 0x1F3FF;
export const ZWJ = 0x200D;           // zero-width joiner
export const VS16 = 0xFE0F;          // variation selectors
export const VS15 = 0xFE0E;
export const KEYCAP = 0x20E3;        // combining enclosing keycap

// ---------------------------------------------------------------------------
// Generated Unicode tables.
//
// Regeneration procedure (dev machine Python 3.14.4, unicodedata 16.0.0):
//     python - <<'EOF'
//     import unicodedata
//     def ranges_of(pred):
//         out=[]
//         for cp in range(0x110000):
//             if pred(chr(cp)):
//                 if out and cp==out[-1][1]+1: out[-1][1]=cp
//                 else: out.append([cp,cp])
//         return out
//     print("EAW_WIDE_F =", ranges_of(lambda c: unicodedata.east_asian_width(c) in ("W","F")))
//     for cat in ["Mn","Mc","Me","Zl","Zp","Cf","Cc"]:
//         print(f"CAT_{cat} =", ranges_of(lambda c, cat=cat: unicodedata.category(c)==cat))
//     EOF
// Counts under Python 3.14.4: EAW_WIDE_F 122, CAT_Mn 357, CAT_Mc 190,
// CAT_Me 5, CAT_Zl 1, CAT_Zp 1, CAT_Cf 21, CAT_Cc 2.  Counts may differ
// under another Python/Unicode version; the differential gate, not table
// provenance, guarantees parity.
// prettier-ignore
export const EAW_WIDE_F: Ranges = [
    [0x1100, 0x115F], [0x231A, 0x231B], [0x2329, 0x232A], [0x23E9, 0x23EC], [0x23F0, 0x23F0], [0x23F3, 0x23F3], [0x25FD, 0x25FE], [0x2614, 0x2615], [0x2630, 0x2637], [0x2648, 0x2653],
    [0x267F, 0x267F], [0x268A, 0x268F], [0x2693, 0x2693], [0x26A1, 0x26A1], [0x26AA, 0x26AB], [0x26BD, 0x26BE], [0x26C4, 0x26C5], [0x26CE, 0x26CE], [0x26D4, 0x26D4], [0x26EA, 0x26EA],
    [0x26F2, 0x26F3], [0x26F5, 0x26F5], [0x26FA, 0x26FA], [0x26FD, 0x26FD], [0x2705, 0x2705], [0x270A, 0x270B], [0x2728, 0x2728], [0x274C, 0x274C], [0x274E, 0x274E], [0x2753, 0x2755],
    [0x2757, 0x2757], [0x2795, 0x2797], [0x27B0, 0x27B0], [0x27BF, 0x27BF], [0x2B1B, 0x2B1C], [0x2B50, 0x2B50], [0x2B55, 0x2B55], [0x2E80, 0x2E99], [0x2E9B, 0x2EF3], [0x2F00, 0x2FD5],
    [0x2FF0, 0x303E], [0x3041, 0x3096], [0x3099, 0x30FF], [0x3105, 0x312F], [0x3131, 0x318E], [0x3190, 0x31E5], [0x31EF, 0x321E], [0x3220, 0x3247], [0x3250, 0xA48C], [0xA490, 0xA4C6],
    [0xA960, 0xA97C], [0xAC00, 0xD7A3], [0xF900, 0xFAFF], [0xFE10, 0xFE19], [0xFE30, 0xFE52], [0xFE54, 0xFE66], [0xFE68, 0xFE6B], [0xFF01, 0xFF60], [0xFFE0, 0xFFE6], [0x16FE0, 0x16FE4],
    [0x16FF0, 0x16FF1], [0x17000, 0x187F7], [0x18800, 0x18CD5], [0x18CFF, 0x18D08], [0x1AFF0, 0x1AFF3], [0x1AFF5, 0x1AFFB], [0x1AFFD, 0x1AFFE], [0x1B000, 0x1B122], [0x1B132, 0x1B132], [0x1B150, 0x1B152],
    [0x1B155, 0x1B155], [0x1B164, 0x1B167], [0x1B170, 0x1B2FB], [0x1D300, 0x1D356], [0x1D360, 0x1D376], [0x1F004, 0x1F004], [0x1F0CF, 0x1F0CF], [0x1F18E, 0x1F18E], [0x1F191, 0x1F19A], [0x1F200, 0x1F202],
    [0x1F210, 0x1F23B], [0x1F240, 0x1F248], [0x1F250, 0x1F251], [0x1F260, 0x1F265], [0x1F300, 0x1F320], [0x1F32D, 0x1F335], [0x1F337, 0x1F37C], [0x1F37E, 0x1F393], [0x1F3A0, 0x1F3CA], [0x1F3CF, 0x1F3D3],
    [0x1F3E0, 0x1F3F0], [0x1F3F4, 0x1F3F4], [0x1F3F8, 0x1F43E], [0x1F440, 0x1F440], [0x1F442, 0x1F4FC], [0x1F4FF, 0x1F53D], [0x1F54B, 0x1F54E], [0x1F550, 0x1F567], [0x1F57A, 0x1F57A], [0x1F595, 0x1F596],
    [0x1F5A4, 0x1F5A4], [0x1F5FB, 0x1F64F], [0x1F680, 0x1F6C5], [0x1F6CC, 0x1F6CC], [0x1F6D0, 0x1F6D2], [0x1F6D5, 0x1F6D7], [0x1F6DC, 0x1F6DF], [0x1F6EB, 0x1F6EC], [0x1F6F4, 0x1F6FC], [0x1F7E0, 0x1F7EB],
    [0x1F7F0, 0x1F7F0], [0x1F90C, 0x1F93A], [0x1F93C, 0x1F945], [0x1F947, 0x1F9FF], [0x1FA70, 0x1FA7C], [0x1FA80, 0x1FA89], [0x1FA8F, 0x1FAC6], [0x1FACE, 0x1FADC], [0x1FADF, 0x1FAE9], [0x1FAF0, 0x1FAF8],
    [0x20000, 0x2FFFD], [0x30000, 0x3FFFD],
];
// prettier-ignore
export const CAT_Mn: Ranges = [
    [0x300, 0x36F], [0x483, 0x487], [0x591, 0x5BD], [0x5BF, 0x5BF], [0x5C1, 0x5C2], [0x5C4, 0x5C5], [0x5C7, 0x5C7], [0x610, 0x61A], [0x64B, 0x65F], [0x670, 0x670],
    [0x6D6, 0x6DC], [0x6DF, 0x6E4], [0x6E7, 0x6E8], [0x6EA, 0x6ED], [0x711, 0x711], [0x730, 0x74A], [0x7A6, 0x7B0], [0x7EB, 0x7F3], [0x7FD, 0x7FD], [0x816, 0x819],
    [0x81B, 0x823], [0x825, 0x827], [0x829, 0x82D], [0x859, 0x85B], [0x897, 0x89F], [0x8CA, 0x8E1], [0x8E3, 0x902], [0x93A, 0x93A], [0x93C, 0x93C], [0x941, 0x948],
    [0x94D, 0x94D], [0x951, 0x957], [0x962, 0x963], [0x981, 0x981], [0x9BC, 0x9BC], [0x9C1, 0x9C4], [0x9CD, 0x9CD], [0x9E2, 0x9E3], [0x9FE, 0x9FE], [0xA01, 0xA02],
    [0xA3C, 0xA3C], [0xA41, 0xA42], [0xA47, 0xA48], [0xA4B, 0xA4D], [0xA51, 0xA51], [0xA70, 0xA71], [0xA75, 0xA75], [0xA81, 0xA82], [0xABC, 0xABC], [0xAC1, 0xAC5],
    [0xAC7, 0xAC8], [0xACD, 0xACD], [0xAE2, 0xAE3], [0xAFA, 0xAFF], [0xB01, 0xB01], [0xB3C, 0xB3C], [0xB3F, 0xB3F], [0xB41, 0xB44], [0xB4D, 0xB4D], [0xB55, 0xB56],
    [0xB62, 0xB63], [0xB82, 0xB82], [0xBC0, 0xBC0], [0xBCD, 0xBCD], [0xC00, 0xC00], [0xC04, 0xC04], [0xC3C, 0xC3C], [0xC3E, 0xC40], [0xC46, 0xC48], [0xC4A, 0xC4D],
    [0xC55, 0xC56], [0xC62, 0xC63], [0xC81, 0xC81], [0xCBC, 0xCBC], [0xCBF, 0xCBF], [0xCC6, 0xCC6], [0xCCC, 0xCCD], [0xCE2, 0xCE3], [0xD00, 0xD01], [0xD3B, 0xD3C],
    [0xD41, 0xD44], [0xD4D, 0xD4D], [0xD62, 0xD63], [0xD81, 0xD81], [0xDCA, 0xDCA], [0xDD2, 0xDD4], [0xDD6, 0xDD6], [0xE31, 0xE31], [0xE34, 0xE3A], [0xE47, 0xE4E],
    [0xEB1, 0xEB1], [0xEB4, 0xEBC], [0xEC8, 0xECE], [0xF18, 0xF19], [0xF35, 0xF35], [0xF37, 0xF37], [0xF39, 0xF39], [0xF71, 0xF7E], [0xF80, 0xF84], [0xF86, 0xF87],
    [0xF8D, 0xF97], [0xF99, 0xFBC], [0xFC6, 0xFC6], [0x102D, 0x1030], [0x1032, 0x1037], [0x1039, 0x103A], [0x103D, 0x103E], [0x1058, 0x1059], [0x105E, 0x1060], [0x1071, 0x1074],
    [0x1082, 0x1082], [0x1085, 0x1086], [0x108D, 0x108D], [0x109D, 0x109D], [0x135D, 0x135F], [0x1712, 0x1714], [0x1732, 0x1733], [0x1752, 0x1753], [0x1772, 0x1773], [0x17B4, 0x17B5],
    [0x17B7, 0x17BD], [0x17C6, 0x17C6], [0x17C9, 0x17D3], [0x17DD, 0x17DD], [0x180B, 0x180D], [0x180F, 0x180F], [0x1885, 0x1886], [0x18A9, 0x18A9], [0x1920, 0x1922], [0x1927, 0x1928],
    [0x1932, 0x1932], [0x1939, 0x193B], [0x1A17, 0x1A18], [0x1A1B, 0x1A1B], [0x1A56, 0x1A56], [0x1A58, 0x1A5E], [0x1A60, 0x1A60], [0x1A62, 0x1A62], [0x1A65, 0x1A6C], [0x1A73, 0x1A7C],
    [0x1A7F, 0x1A7F], [0x1AB0, 0x1ABD], [0x1ABF, 0x1ACE], [0x1B00, 0x1B03], [0x1B34, 0x1B34], [0x1B36, 0x1B3A], [0x1B3C, 0x1B3C], [0x1B42, 0x1B42], [0x1B6B, 0x1B73], [0x1B80, 0x1B81],
    [0x1BA2, 0x1BA5], [0x1BA8, 0x1BA9], [0x1BAB, 0x1BAD], [0x1BE6, 0x1BE6], [0x1BE8, 0x1BE9], [0x1BED, 0x1BED], [0x1BEF, 0x1BF1], [0x1C2C, 0x1C33], [0x1C36, 0x1C37], [0x1CD0, 0x1CD2],
    [0x1CD4, 0x1CE0], [0x1CE2, 0x1CE8], [0x1CED, 0x1CED], [0x1CF4, 0x1CF4], [0x1CF8, 0x1CF9], [0x1DC0, 0x1DFF], [0x20D0, 0x20DC], [0x20E1, 0x20E1], [0x20E5, 0x20F0], [0x2CEF, 0x2CF1],
    [0x2D7F, 0x2D7F], [0x2DE0, 0x2DFF], [0x302A, 0x302D], [0x3099, 0x309A], [0xA66F, 0xA66F], [0xA674, 0xA67D], [0xA69E, 0xA69F], [0xA6F0, 0xA6F1], [0xA802, 0xA802], [0xA806, 0xA806],
    [0xA80B, 0xA80B], [0xA825, 0xA826], [0xA82C, 0xA82C], [0xA8C4, 0xA8C5], [0xA8E0, 0xA8F1], [0xA8FF, 0xA8FF], [0xA926, 0xA92D], [0xA947, 0xA951], [0xA980, 0xA982], [0xA9B3, 0xA9B3],
    [0xA9B6, 0xA9B9], [0xA9BC, 0xA9BD], [0xA9E5, 0xA9E5], [0xAA29, 0xAA2E], [0xAA31, 0xAA32], [0xAA35, 0xAA36], [0xAA43, 0xAA43], [0xAA4C, 0xAA4C], [0xAA7C, 0xAA7C], [0xAAB0, 0xAAB0],
    [0xAAB2, 0xAAB4], [0xAAB7, 0xAAB8], [0xAABE, 0xAABF], [0xAAC1, 0xAAC1], [0xAAEC, 0xAAED], [0xAAF6, 0xAAF6], [0xABE5, 0xABE5], [0xABE8, 0xABE8], [0xABED, 0xABED], [0xFB1E, 0xFB1E],
    [0xFE00, 0xFE0F], [0xFE20, 0xFE2F], [0x101FD, 0x101FD], [0x102E0, 0x102E0], [0x10376, 0x1037A], [0x10A01, 0x10A03], [0x10A05, 0x10A06], [0x10A0C, 0x10A0F], [0x10A38, 0x10A3A], [0x10A3F, 0x10A3F],
    [0x10AE5, 0x10AE6], [0x10D24, 0x10D27], [0x10D69, 0x10D6D], [0x10EAB, 0x10EAC], [0x10EFC, 0x10EFF], [0x10F46, 0x10F50], [0x10F82, 0x10F85], [0x11001, 0x11001], [0x11038, 0x11046], [0x11070, 0x11070],
    [0x11073, 0x11074], [0x1107F, 0x11081], [0x110B3, 0x110B6], [0x110B9, 0x110BA], [0x110C2, 0x110C2], [0x11100, 0x11102], [0x11127, 0x1112B], [0x1112D, 0x11134], [0x11173, 0x11173], [0x11180, 0x11181],
    [0x111B6, 0x111BE], [0x111C9, 0x111CC], [0x111CF, 0x111CF], [0x1122F, 0x11231], [0x11234, 0x11234], [0x11236, 0x11237], [0x1123E, 0x1123E], [0x11241, 0x11241], [0x112DF, 0x112DF], [0x112E3, 0x112EA],
    [0x11300, 0x11301], [0x1133B, 0x1133C], [0x11340, 0x11340], [0x11366, 0x1136C], [0x11370, 0x11374], [0x113BB, 0x113C0], [0x113CE, 0x113CE], [0x113D0, 0x113D0], [0x113D2, 0x113D2], [0x113E1, 0x113E2],
    [0x11438, 0x1143F], [0x11442, 0x11444], [0x11446, 0x11446], [0x1145E, 0x1145E], [0x114B3, 0x114B8], [0x114BA, 0x114BA], [0x114BF, 0x114C0], [0x114C2, 0x114C3], [0x115B2, 0x115B5], [0x115BC, 0x115BD],
    [0x115BF, 0x115C0], [0x115DC, 0x115DD], [0x11633, 0x1163A], [0x1163D, 0x1163D], [0x1163F, 0x11640], [0x116AB, 0x116AB], [0x116AD, 0x116AD], [0x116B0, 0x116B5], [0x116B7, 0x116B7], [0x1171D, 0x1171D],
    [0x1171F, 0x1171F], [0x11722, 0x11725], [0x11727, 0x1172B], [0x1182F, 0x11837], [0x11839, 0x1183A], [0x1193B, 0x1193C], [0x1193E, 0x1193E], [0x11943, 0x11943], [0x119D4, 0x119D7], [0x119DA, 0x119DB],
    [0x119E0, 0x119E0], [0x11A01, 0x11A0A], [0x11A33, 0x11A38], [0x11A3B, 0x11A3E], [0x11A47, 0x11A47], [0x11A51, 0x11A56], [0x11A59, 0x11A5B], [0x11A8A, 0x11A96], [0x11A98, 0x11A99], [0x11C30, 0x11C36],
    [0x11C38, 0x11C3D], [0x11C3F, 0x11C3F], [0x11C92, 0x11CA7], [0x11CAA, 0x11CB0], [0x11CB2, 0x11CB3], [0x11CB5, 0x11CB6], [0x11D31, 0x11D36], [0x11D3A, 0x11D3A], [0x11D3C, 0x11D3D], [0x11D3F, 0x11D45],
    [0x11D47, 0x11D47], [0x11D90, 0x11D91], [0x11D95, 0x11D95], [0x11D97, 0x11D97], [0x11EF3, 0x11EF4], [0x11F00, 0x11F01], [0x11F36, 0x11F3A], [0x11F40, 0x11F40], [0x11F42, 0x11F42], [0x11F5A, 0x11F5A],
    [0x13440, 0x13440], [0x13447, 0x13455], [0x1611E, 0x16129], [0x1612D, 0x1612F], [0x16AF0, 0x16AF4], [0x16B30, 0x16B36], [0x16F4F, 0x16F4F], [0x16F8F, 0x16F92], [0x16FE4, 0x16FE4], [0x1BC9D, 0x1BC9E],
    [0x1CF00, 0x1CF2D], [0x1CF30, 0x1CF46], [0x1D167, 0x1D169], [0x1D17B, 0x1D182], [0x1D185, 0x1D18B], [0x1D1AA, 0x1D1AD], [0x1D242, 0x1D244], [0x1DA00, 0x1DA36], [0x1DA3B, 0x1DA6C], [0x1DA75, 0x1DA75],
    [0x1DA84, 0x1DA84], [0x1DA9B, 0x1DA9F], [0x1DAA1, 0x1DAAF], [0x1E000, 0x1E006], [0x1E008, 0x1E018], [0x1E01B, 0x1E021], [0x1E023, 0x1E024], [0x1E026, 0x1E02A], [0x1E08F, 0x1E08F], [0x1E130, 0x1E136],
    [0x1E2AE, 0x1E2AE], [0x1E2EC, 0x1E2EF], [0x1E4EC, 0x1E4EF], [0x1E5EE, 0x1E5EF], [0x1E8D0, 0x1E8D6], [0x1E944, 0x1E94A], [0xE0100, 0xE01EF],
];
// prettier-ignore
export const CAT_Mc: Ranges = [
    [0x903, 0x903], [0x93B, 0x93B], [0x93E, 0x940], [0x949, 0x94C], [0x94E, 0x94F], [0x982, 0x983], [0x9BE, 0x9C0], [0x9C7, 0x9C8], [0x9CB, 0x9CC], [0x9D7, 0x9D7],
    [0xA03, 0xA03], [0xA3E, 0xA40], [0xA83, 0xA83], [0xABE, 0xAC0], [0xAC9, 0xAC9], [0xACB, 0xACC], [0xB02, 0xB03], [0xB3E, 0xB3E], [0xB40, 0xB40], [0xB47, 0xB48],
    [0xB4B, 0xB4C], [0xB57, 0xB57], [0xBBE, 0xBBF], [0xBC1, 0xBC2], [0xBC6, 0xBC8], [0xBCA, 0xBCC], [0xBD7, 0xBD7], [0xC01, 0xC03], [0xC41, 0xC44], [0xC82, 0xC83],
    [0xCBE, 0xCBE], [0xCC0, 0xCC4], [0xCC7, 0xCC8], [0xCCA, 0xCCB], [0xCD5, 0xCD6], [0xCF3, 0xCF3], [0xD02, 0xD03], [0xD3E, 0xD40], [0xD46, 0xD48], [0xD4A, 0xD4C],
    [0xD57, 0xD57], [0xD82, 0xD83], [0xDCF, 0xDD1], [0xDD8, 0xDDF], [0xDF2, 0xDF3], [0xF3E, 0xF3F], [0xF7F, 0xF7F], [0x102B, 0x102C], [0x1031, 0x1031], [0x1038, 0x1038],
    [0x103B, 0x103C], [0x1056, 0x1057], [0x1062, 0x1064], [0x1067, 0x106D], [0x1083, 0x1084], [0x1087, 0x108C], [0x108F, 0x108F], [0x109A, 0x109C], [0x1715, 0x1715], [0x1734, 0x1734],
    [0x17B6, 0x17B6], [0x17BE, 0x17C5], [0x17C7, 0x17C8], [0x1923, 0x1926], [0x1929, 0x192B], [0x1930, 0x1931], [0x1933, 0x1938], [0x1A19, 0x1A1A], [0x1A55, 0x1A55], [0x1A57, 0x1A57],
    [0x1A61, 0x1A61], [0x1A63, 0x1A64], [0x1A6D, 0x1A72], [0x1B04, 0x1B04], [0x1B35, 0x1B35], [0x1B3B, 0x1B3B], [0x1B3D, 0x1B41], [0x1B43, 0x1B44], [0x1B82, 0x1B82], [0x1BA1, 0x1BA1],
    [0x1BA6, 0x1BA7], [0x1BAA, 0x1BAA], [0x1BE7, 0x1BE7], [0x1BEA, 0x1BEC], [0x1BEE, 0x1BEE], [0x1BF2, 0x1BF3], [0x1C24, 0x1C2B], [0x1C34, 0x1C35], [0x1CE1, 0x1CE1], [0x1CF7, 0x1CF7],
    [0x302E, 0x302F], [0xA823, 0xA824], [0xA827, 0xA827], [0xA880, 0xA881], [0xA8B4, 0xA8C3], [0xA952, 0xA953], [0xA983, 0xA983], [0xA9B4, 0xA9B5], [0xA9BA, 0xA9BB], [0xA9BE, 0xA9C0],
    [0xAA2F, 0xAA30], [0xAA33, 0xAA34], [0xAA4D, 0xAA4D], [0xAA7B, 0xAA7B], [0xAA7D, 0xAA7D], [0xAAEB, 0xAAEB], [0xAAEE, 0xAAEF], [0xAAF5, 0xAAF5], [0xABE3, 0xABE4], [0xABE6, 0xABE7],
    [0xABE9, 0xABEA], [0xABEC, 0xABEC], [0x11000, 0x11000], [0x11002, 0x11002], [0x11082, 0x11082], [0x110B0, 0x110B2], [0x110B7, 0x110B8], [0x1112C, 0x1112C], [0x11145, 0x11146], [0x11182, 0x11182],
    [0x111B3, 0x111B5], [0x111BF, 0x111C0], [0x111CE, 0x111CE], [0x1122C, 0x1122E], [0x11232, 0x11233], [0x11235, 0x11235], [0x112E0, 0x112E2], [0x11302, 0x11303], [0x1133E, 0x1133F], [0x11341, 0x11344],
    [0x11347, 0x11348], [0x1134B, 0x1134D], [0x11357, 0x11357], [0x11362, 0x11363], [0x113B8, 0x113BA], [0x113C2, 0x113C2], [0x113C5, 0x113C5], [0x113C7, 0x113CA], [0x113CC, 0x113CD], [0x113CF, 0x113CF],
    [0x11435, 0x11437], [0x11440, 0x11441], [0x11445, 0x11445], [0x114B0, 0x114B2], [0x114B9, 0x114B9], [0x114BB, 0x114BE], [0x114C1, 0x114C1], [0x115AF, 0x115B1], [0x115B8, 0x115BB], [0x115BE, 0x115BE],
    [0x11630, 0x11632], [0x1163B, 0x1163C], [0x1163E, 0x1163E], [0x116AC, 0x116AC], [0x116AE, 0x116AF], [0x116B6, 0x116B6], [0x1171E, 0x1171E], [0x11720, 0x11721], [0x11726, 0x11726], [0x1182C, 0x1182E],
    [0x11838, 0x11838], [0x11930, 0x11935], [0x11937, 0x11938], [0x1193D, 0x1193D], [0x11940, 0x11940], [0x11942, 0x11942], [0x119D1, 0x119D3], [0x119DC, 0x119DF], [0x119E4, 0x119E4], [0x11A39, 0x11A39],
    [0x11A57, 0x11A58], [0x11A97, 0x11A97], [0x11C2F, 0x11C2F], [0x11C3E, 0x11C3E], [0x11CA9, 0x11CA9], [0x11CB1, 0x11CB1], [0x11CB4, 0x11CB4], [0x11D8A, 0x11D8E], [0x11D93, 0x11D94], [0x11D96, 0x11D96],
    [0x11EF5, 0x11EF6], [0x11F03, 0x11F03], [0x11F34, 0x11F35], [0x11F3E, 0x11F3F], [0x11F41, 0x11F41], [0x1612A, 0x1612C], [0x16F51, 0x16F87], [0x16FF0, 0x16FF1], [0x1D165, 0x1D166], [0x1D16D, 0x1D172],
];
export const CAT_Me: Ranges = [
  [0x488, 0x489], [0x1ABE, 0x1ABE], [0x20DD, 0x20E0], [0x20E2, 0x20E4], [0xA670, 0xA672],
];
export const CAT_Zl: Ranges = [
  [0x2028, 0x2028],
];
export const CAT_Zp: Ranges = [
  [0x2029, 0x2029],
];
export const CAT_Cf: Ranges = [
  [0xAD, 0xAD], [0x600, 0x605], [0x61C, 0x61C], [0x6DD, 0x6DD], [0x70F, 0x70F], [0x890, 0x891], [0x8E2, 0x8E2], [0x180E, 0x180E], [0x200B, 0x200F], [0x202A, 0x202E],
  [0x2060, 0x2064], [0x2066, 0x206F], [0xFEFF, 0xFEFF], [0xFFF9, 0xFFFB], [0x110BD, 0x110BD], [0x110CD, 0x110CD], [0x13430, 0x1343F], [0x1BCA0, 0x1BCA3], [0x1D173, 0x1D17A], [0xE0001, 0xE0001],
  [0xE0020, 0xE007F],
];
export const CAT_Cc: Ranges = [
  [0x0, 0x1F], [0x7F, 0x9F],
];

/** Binary search over sorted [lo, hi] ranges (Python's linear _in_ranges). */
export function inRanges(cp: number, ranges: Ranges): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [rlo, rhi] = ranges[mid];
    if (cp < rlo) hi = mid - 1;
    else if (cp > rhi) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Unicode general category, only for the classes display_width distinguishes. */
function categoryOf(cp: number): string {
  if (inRanges(cp, CAT_Mn)) return "Mn";
  if (inRanges(cp, CAT_Mc)) return "Mc";
  if (inRanges(cp, CAT_Me)) return "Me";
  if (inRanges(cp, CAT_Zl)) return "Zl";
  if (inRanges(cp, CAT_Zp)) return "Zp";
  if (inRanges(cp, CAT_Cf)) return "Cf";
  if (inRanges(cp, CAT_Cc)) return "Cc";
  return "Lo"; // any other category takes the base-character path
}

function isEmojiBase(cp: number): boolean {
  return (0x1F000 <= cp && cp <= 0x1FAFF) || inRanges(cp, EMOJI_PRESENTATION);
}

/** Width of a base (non-modifier) codepoint: 2 for emoji/wide, else 1. */
function charBaseWidth(cp: number): number {
  if (isEmojiBase(cp)) return 2;
  if (inRanges(cp, EAW_WIDE_F)) return 2;
  return 1;
}

/**
 * Display width of `text` in monospace terminal columns.
 *
 * Cluster-aware: a base character plus its combining marks, variation
 * selectors, skin-tone modifiers, keycap, and ZWJ-joined members form one
 * glyph.  Emoji clusters are 2 wide, text clusters keep their base width.
 * Regional indicators are consumed in pairs (one flag = 2 wide).
 * ANSI escape sequences count zero width.
 */
export function displayWidth(text: string, tabWidth = 8): number {
  // Strip ANSI escapes first (they are zero width in terminals)
  const clean = text.replace(ANSI_RE, "");
  const chars = Array.from(clean);
  let width = 0;
  let i = 0;
  const n = chars.length;
  while (i < n) {
    const cp = chars[i]!.codePointAt(0)!;
    if (cp === 0x09) { // tab -> next tab stop
      width += tabWidth - (width % tabWidth);
      i += 1;
      continue;
    }
    const cat = categoryOf(cp);
    if (cat === "Mn" || cat === "Mc" || cat === "Me" || cat === "Zl" || cat === "Zp") {
      i += 1;
      continue;
    }
    if (cat === "Cf") { // format chars
      if (cp === ZWJ) {
        // A ZWJ reached here was not consumed by a preceding base.
        // Treat it as zero-width; the next character keeps its own
        // width (a following emoji is a standalone 2-wide glyph,
        // a following zero-width char adds nothing).
        const j = i + 1;
        if (j < n) {
          const nxt = chars[j]!.codePointAt(0)!;
          const nxtCat = categoryOf(nxt);
          if (isEmojiBase(nxt)) {
            width += 2;
            i = j + 1;
          } else if (nxtCat === "Mn" || nxtCat === "Mc" || nxtCat === "Me" ||
              nxtCat === "Cf" || nxtCat === "Cc" || nxtCat === "Zl" || nxtCat === "Zp") {
            i += 1;
          } else {
            width += charBaseWidth(nxt);
            i = j + 1;
          }
        } else {
          i += 1;
        }
        continue;
      }
      // other Cf (VS, ZWSP, etc.) are zero width
      i += 1;
      continue;
    }
    if (cat === "Cc") { // control
      i += 1;
      continue;
    }
    if (RI_LO <= cp && cp <= RI_HI) { // flag pair
      if (i + 1 < n) {
        const nxt = chars[i + 1]!.codePointAt(0)!;
        if (RI_LO <= nxt && nxt <= RI_HI) {
          width += 2;
          i += 2;
          continue;
        }
      }
      width += 2;
      i += 1;
      continue;
    }
    const baseW = charBaseWidth(cp);
    let hasVs16 = false;
    let hasVs15 = false;
    let hasKeycap = false;
    let extra = 0;
    const emojiBase = isEmojiBase(cp);
    const vsCapable = emojiBase || inRanges(cp, VS16_CAPABLE);
    let j = i + 1;
    while (j < n) { // consume modifiers
      const cj = chars[j]!.codePointAt(0)!;
      const catj = categoryOf(cj);
      if (catj === "Mn" || catj === "Mc" || catj === "Me") {
        if (cj === VS16) hasVs16 = true;
        if (cj === VS15) hasVs15 = true;
        if (cj === KEYCAP) hasKeycap = true;
        j += 1;
      } else if (catj === "Cf") {
        if (cj === VS16) hasVs16 = true;
        if (cj === VS15) hasVs15 = true;
        if (cj === KEYCAP) hasKeycap = true;
        if (cj === ZWJ && emojiBase) {
          // ZWJ joins the next base into this cluster
          j += 1;
          if (j < n && isEmojiBase(chars[j]!.codePointAt(0)!)) {
            // next base is emoji -> cluster stays 2-wide (no extra width)
            j += 1;
          } else if (j < n) {
            const nxt = chars[j]!.codePointAt(0)!;
            const nxtCat = categoryOf(nxt);
            if (nxtCat !== "Mn" && nxtCat !== "Mc" && nxtCat !== "Me" &&
                nxtCat !== "Cf" && nxtCat !== "Cc" && nxtCat !== "Zl" && nxtCat !== "Zp") {
              extra += charBaseWidth(nxt);
            }
            j += 1;
          }
        } else {
          j += 1;
        }
      } else if (SKIN_LO <= cj && cj <= SKIN_HI && emojiBase) {
        j += 1;
      } else {
        break;
      }
    }
    i = j;
    if (hasKeycap) {
      width += 2;
    } else if (hasVs15 && vsCapable) {
      width += 1; // text presentation forced
    } else if (hasVs16 && vsCapable) {
      width += 2; // emoji presentation forced
    } else {
      width += baseW + extra;
    }
  }
  return width;
}

/** Expand tabs to spaces using display-column tab stops. */
export function expandTabs(text: string, tabWidth = 8): string {
  if (!text.includes("\t")) return text;
  const chars = Array.from(text);
  const out: string[] = [];
  let col = 0;
  for (const ch of chars) {
    if (ch === "\t") {
      const pad = tabWidth - (col % tabWidth);
      out.push(" ".repeat(pad));
      col += pad;
    } else {
      out.push(ch);
      col += displayWidth(ch);
    }
  }
  return out.join("");
}

// ---------------------------------------------------------------------------
// Tokenization (ANSI-aware)
// ---------------------------------------------------------------------------

// CSI sequences (SGR, cursor moves...), OSC sequences, charset designators,
// lone ESC.  Global flag; consumers must treat it as stateless (matchAll
// clones it) — do not set lastIndex manually.
export const ANSI_RE = /[\x1b]\[[0-9;:?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b/g;

/** Split into ('ansi' | 'plain', text) pieces; ansi pieces are zero-width. */
export function tokenize(text: string): Array<["ansi" | "plain", string]> {
  const pieces: Array<["ansi" | "plain", string]> = [];
  let pos = 0;
  for (const m of text.matchAll(ANSI_RE)) {
    if (m.index > pos) pieces.push(["plain", text.slice(pos, m.index)]);
    pieces.push(["ansi", m[0]]);
    pos = m.index + m[0].length;
  }
  if (pos < text.length) pieces.push(["plain", text.slice(pos)]);
  return pieces;
}

// ---------------------------------------------------------------------------
// Python-faithful whitespace helpers
// ---------------------------------------------------------------------------
//
// Python's str.strip()/str.isspace()/re \s use a larger whitespace set than
// JS String.trim(): they include \u0085, \u001c-\u001f and exclude \ufeff.
// `WS` holds the literal characters; the regex character class is built as
// "[" + WS + "]" — the \u2000-\u200a range inside it is a valid class range.

export const WS =
  "\t\n\v\f\r \u001c\u001d\u001e\u001f\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000";
const WS_CLASS = "[" + WS + "]";
const STRIP_RE = new RegExp("^" + WS_CLASS + "+|" + WS_CLASS + "+$", "g");
const RSTRIP_RE = new RegExp(WS_CLASS + "+$");

/** Python str.strip(): strip leading/trailing whitespace (both sides). */
export function pyStrip(s: string): string {
  return s.replace(STRIP_RE, "");
}

/** Python str.rstrip(): strip trailing whitespace only. */
export function pyRstrip(s: string): string {
  return s.replace(RSTRIP_RE, "");
}

/** Python str.isspace(): true when every code point is whitespace. */
export function pyIsSpace(s: string): boolean {
  return s.length > 0 && new RegExp("^" + WS_CLASS + "+$").test(s);
}

// ---------------------------------------------------------------------------
// Table parsing
// ---------------------------------------------------------------------------

export const PREFIX_RE = /^(?<prefix> {0,3}(?:> ?)*)(?<body>.*)$/;
// Lines starting like this are block-level elements -> they end a table.
// (`\s` from the Python regex is replaced by the shared whitespace class.)
export const BLOCK_START_RE = new RegExp(
  "^(#{1,6}" + WS_CLASS + "|>|[-+*]" + WS_CLASS + "|\\d+[.)]" + WS_CLASS + "|```|~~~|<[a-zA-Z]|<!--)");
export const HR_RE = new RegExp("^(-{3,}|_{3,}|\\*{3,})" + WS_CLASS + "*$");
export const FENCE_OPEN_RE = /^ {0,3}(?:> ?)*(`{3,}|~{3,})/;
export const MATH_OPEN_RE = new RegExp("^ {0,3}\\$\\$" + WS_CLASS + "*$");
// CommonMark raw HTML block: an opening tag / comment / declaration at the
// start of a line runs until the first blank line.  Content inside it (even
// table-shaped lines) must never be touched.
export const HTML_BLOCK_RE = /^ {0,3}<[a-zA-Z!/?]/;

/**
 * Split a row body into cells.
 *
 * A `|` delimits cells unless it is backslash-escaped (`\|`) or sits inside
 * an inline code span (`` `a|b` ``).  Matching follows GFM: a code span
 * opens with a backtick run and closes with a run of the same length.
 */
export function splitRow(line: string): string[] {
  const chars = Array.from(line);
  const cells: string[] = [];
  let cur: string[] = [];
  let i = 0;
  const n = chars.length;
  let codeLen = 0;
  while (i < n) {
    const c = chars[i]!;
    if (c === "\\" && i + 1 < n) {
      cur.push(chars.slice(i, i + 2).join(""));
      i += 2;
      continue;
    }
    if (c === "`") {
      let j = i;
      while (j < n && chars[j] === "`") j++;
      const run = j - i;
      if (codeLen === 0) {
        codeLen = run;
        cur.push(chars.slice(i, j).join(""));
      } else if (run === codeLen) {
        codeLen = 0;
        cur.push(chars.slice(i, j).join(""));
      } else {
        cur.push(chars.slice(i, j).join(""));
      }
      i = j;
      continue;
    }
    if (c === "|" && codeLen === 0) {
      cells.push(cur.join(""));
      cur = [];
      i += 1;
      continue;
    }
    cur.push(c);
    i += 1;
  }
  cells.push(cur.join(""));
  return cells;
}

/** Parse a row line body.  Returns {cells, lead, trail}. */
export function parseRowBody(body: string): {
  cells: string[];
  lead: boolean;
  trail: boolean;
} {
  const hasLead = body.startsWith("|");
  const hasTrail = body.endsWith("|");
  let inner = hasLead ? body.slice(1) : body;
  if (hasTrail) inner = inner.slice(0, -1);
  const cells = splitRow(inner).map((c) => pyStrip(c));
  return { cells, lead: hasLead, trail: hasTrail };
}

/** Map a delimiter cell to alignment: 'l', 'r', 'c', 'n' or null. */
export function parseDelimCell(cell: string): "l" | "r" | "c" | "n" | null {
  const s = pyStrip(cell);
  if (!/^:?-+:?$/.test(s)) return null;
  const left = s.startsWith(":");
  const right = s.endsWith(":");
  if (left && right) return "c";
  if (right) return "r";
  if (left) return "l";
  return "n";
}

/** True when `body` is a GFM delimiter row (dashes + optional colons). */
export function isDelimiterRow(body: string): boolean {
  if (!body.includes("|")) return false;
  const { cells } = parseRowBody(body);
  if (cells.length === 0) return false;
  for (const c of cells) {
    if (parseDelimCell(c) === null) return false;
  }
  return true;
}

function normPrefix(prefix: string): string {
  return prefix.replace(/> ?/g, ">");
}

export interface Row {
  cells: string[][]; // per cell: fragments
}

export interface Table {
  prefix: string;
  lead: boolean;
  trail: boolean;
  ncols: number;
  header: string[][]; // fragments per header cell
  aligns: string[];
  sepCells: string[]; // raw delimiter cells
  rows: Row[];
  wrapWidth: number;
  warnings: string[];
}

/**
 * Fold multi-line (wrapped) rows back together.
 *
 * A line whose first cell is empty is a continuation candidate.  A run of
 * candidates is merged; if the merged row's joined content still exceeds
 * `wrapWidth` the merge stands (the row genuinely wrapped), otherwise the
 * candidates were fresh rows and the merge is undone.  With
 * `wrapWidth == 0` (no wrapping) nothing is ever merged.
 */
function mergeContinuations(rows: Row[], wrapWidth: number): Row[] {
  const result: Row[] = [];
  let i = 0;
  const n = rows.length;
  while (i < n) {
    const row = rows[i]!;
    let j = i + 1;
    let merged: Row | null = null;
    const isContinuation = (r: Row): boolean =>
      r.cells.length > 0 && r.cells[0]!.length === 1 && r.cells[0]![0] === "";
    while (j < n && isContinuation(rows[j]!)) {
      if (merged === null) {
        merged = { ...row, cells: row.cells.map((c) => [...c]) };
      }
      const cand = rows[j]!;
      for (let k = 0; k < merged.cells.length; k++) {
        if (!(cand.cells[k]!.length === 1 && cand.cells[k]![0] === "")) {
          merged.cells[k]!.push(cand.cells[k]![0]!);
        }
      }
      j += 1;
    }
    if (merged !== null) {
      const maxw = Math.max(...merged.cells.map((c) => displayWidth(c.join(" "))));
      if (wrapWidth && maxw > wrapWidth) {
        result.push(merged);
        i = j;
        continue;
      }
      // wrong merge: keep the row, re-examine candidates as fresh rows
      result.push(row);
      i += 1;
      continue;
    }
    result.push(row);
    i += 1;
  }
  return result;
}

/** Collect the table starting at line `i`; returns {table, next} or null. */
export function collectTable(
  lines: string[],
  i: number,
  wrapWidth: number,
  tabWidth: number,
): { table: Table; next: number } | null {
  const m0 = lines[i]!.match(PREFIX_RE);
  const m1 = lines[i + 1]!.match(PREFIX_RE);
  if (m0 === null || m1 === null || m0.groups === undefined || m1.groups === undefined) {
    return null;
  }
  const prefix0 = m0.groups.prefix;
  const body0 = pyRstrip(m0.groups.body);
  const body1 = pyRstrip(m1.groups.body);
  if (!body0 || !isDelimiterRow(body1)) return null;
  const { cells: headerCells, lead, trail } = parseRowBody(body0);
  const { cells: delimCells } = parseRowBody(body1);
  // Tabs expand relative to the cell's own start (the column a tab stop
  // lands on depends on the cell content, not the raw line position).
  const expHeader = headerCells.map((cell) => expandTabs(cell, tabWidth));
  const expDelim = delimCells.map((cell) => expandTabs(cell, tabWidth));
  const aligns: string[] = [];
  for (const c of expDelim) {
    const a = parseDelimCell(c);
    if (a === null) return null;
    aligns.push(a);
  }
  const ncols = aligns.length;
  if (ncols === 0) return null;
  // GFM: the header row must have exactly as many cells as the delimiter
  // row; a mismatch means this is not a table (e.g. `a | b` + `---` is a
  // setext heading) and the lines must pass through untouched.
  if (expHeader.length !== ncols) return null;
  const warnings: string[] = [];
  const header = expHeader.map((c) => [c]);

  const rows: Row[] = [];
  let j = i + 2;
  while (j < lines.length) {
    const line = lines[j]!;
    if (!pyStrip(line)) break;
    const m = line.match(PREFIX_RE);
    if (m === null || m.groups === undefined ||
        normPrefix(m.groups.prefix) !== normPrefix(prefix0)) {
      break;
    }
    const body = pyRstrip(m.groups.body);
    if (!body) break;
    if (BLOCK_START_RE.test(body) || HR_RE.test(body)) break;
    if (ncols > 1 && !body.includes("|")) break;
    let { cells } = parseRowBody(body);
    cells = cells.map((cell) => expandTabs(cell, tabWidth));
    if (cells.length > ncols) {
      warnings.push(
        `row ${j + 1} has ${cells.length} cells but table has ${ncols} column(s); extra cell(s) dropped`);
    }
    cells = cells.concat(new Array<string>(ncols).fill("")).slice(0, ncols);
    rows.push({ cells: cells.map((c) => [c]) });
    j += 1;
  }
  const mergedRows = mergeContinuations(rows, wrapWidth);
  return {
    table: {
      prefix: prefix0,
      lead,
      trail,
      ncols,
      header,
      aligns,
      sepCells: expDelim,
      rows: mergedRows,
      wrapWidth,
      warnings,
    },
    next: j,
  };
}

/** Locate all tables; returns [start_line, end_line, Table] in line order. */
export function findTables(
  lines: string[],
  wrapWidth: number,
  tabWidth: number,
): Array<[number, number, Table]> {
  const tables: Array<[number, number, Table]> = [];
  let i = 0;
  const n = lines.length;
  let fence: [string, number] | null = null;
  while (i < n) {
    const line = lines[i]!;
    if (fence !== null) {
      const [ch, flen] = fence;
      if (new RegExp("^ {0,3}(?:> ?)*" + ch + "{" + flen + ",}[ \\t]*$").test(line)) {
        fence = null;
      }
      i += 1;
      continue;
    }
    if (MATH_OPEN_RE.test(line)) {
      i += 1;
      while (i < n && !MATH_OPEN_RE.test(lines[i]!)) i += 1;
      if (i < n) i += 1; // skip the closing $$
      continue;
    }
    if (HTML_BLOCK_RE.test(line)) {
      i += 1;
      while (i < n && pyStrip(lines[i]!)) i += 1;
      continue;
    }
    const mf = line.match(FENCE_OPEN_RE);
    if (mf !== null) {
      fence = [mf[1]![0]!, mf[1]!.length];
      i += 1;
      continue;
    }
    if (pyStrip(line) && i + 1 < n) {
      const found = collectTable(lines, i, wrapWidth, tabWidth);
      if (found !== null) {
        tables.push([i, found.next, found.table]);
        i = found.next;
        continue;
      }
    }
    i += 1;
  }
  return tables;
}
