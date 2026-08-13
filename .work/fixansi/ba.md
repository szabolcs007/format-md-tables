# Bytes and ANSI

*BOM-bearing, CRLF file with ANSI-colored cells and a wrap case. The BOM, CRLF
line endings, and every escape sequence must survive alignment; only the table
grid may change. The harness asserts these byte-level properties.*

## 1. ANSI colors inside cells

*Escape sequences count zero columns: the borders must align even though the
raw text contains `\x1b[31m` etc. The reset code must stay attached to its text.*

|  Severity  |  Message            |
| ---------- | ------------------- |
|  [31mERROR[0m     |  something failed   |
|  [1;33mWARN[0m      |  [36mcyan note[0m here     |
|  ok        |  no styling at all  |

## 2. Wrapping a colored cell

*This cell exceeds 40 columns with a color code mid-text; the wrap must keep
each escape with the characters it styles and never split a cluster.*

|  Colored log                             |
| ---------------------------------------- |
| [32mstartgreen[0mthenaverylongunbroken          |
| token                                    |
| supercalifragilisticexpialidocious-      |
| antidisestablishmentarianism             |
| {ESC}[31mendred{ESC}[0m                  |

## 3. CRLF + mixed content

*CRLF line endings are preserved; a blockquote table works on CRLF too.*

> |  Key    |  Value  |
> | ------- | ------- |
> |  a      |  1      |
