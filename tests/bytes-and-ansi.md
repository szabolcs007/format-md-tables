# Bytes and ANSI

*BOM-bearing, CRLF file with ANSI-colored cells and a long-cell case. The BOM,
CRLF line endings, and every escape sequence must survive alignment; only the
table grid may change. The harness asserts these byte-level properties.*

## 1. ANSI colors inside cells

*Escape sequences count zero columns: the borders must align even though the
raw text contains `\x1b[31m` etc. The reset code must stay attached to its text.*

| Severity | Message |
| --- | --- |
| [31mERROR[0m | something failed |
| [1;33mWARN[0m | [36mcyan note[0m here |
| ok | no styling at all |
| [31m[0m | ansi-only cell |

## 2. Long colored cell

*This cell is intentionally long and contains a color code mid-text; the complete cell must remain on one physical row and every escape must survive.*

| Area | Colored log |
| --- | --- |
| app | [32mstart green [0m then a very long unbroken token supercalifragilisticexpialidocious-antidisestablishmentarianism {ESC}[31mend red{ESC}[0m |

## 3. CRLF + mixed content

*CRLF line endings are preserved; a blockquote table works on CRLF too.*

> | Key | Value |
> | --- | ----- |
> | a   | 1     |

> | Key | Value |
> | --- | ----- |
> | a   | 1     |
