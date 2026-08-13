# must-not-touch.md

*Negative fixtures for the table aligner: every line of this file must pass through byte-identical. Nothing below is an alignable GFM table — each section is a trap for naive pipe scanning.*

## 1. Fenced code block with a `python` info string

A table inside a backtick fence is code, not a table. This fence carries the `python` info string and contains delimiter-looking rows; the aligner must not re-space a single character of it.

```python
# table-looking code
| name   | value | unit |
| :----- | ----: | :--: |
| temp   |    22 |  °C  |
| humid  |  0.55 |   %  |
print("| not a table |")
```

## 2. Tilde fence with an info string

Same story with `~~~` markers and a `text` info string: the pipes and dashes inside are code.

~~~text
| a | b |
| - | - |
const s = "| x | y |";
~~~

## 3. Fence inside a blockquote

Every line of this fenced block is prefixed with `> `, including the fence markers. The blockquote prefix must be tracked so the quoted fence and its table-looking body are left untouched.

> The quoted fence starts on the next line:
>
> ```
> | q | r |
> | - | - |
> ```
>
> End of the quoted fence; nothing in this quote may move.

## 4. Nested fences

Fences cannot nest: a fence marker of a different type inside an open fence is plain text. The three-backtick line inside the tilde fence below must not close it.

~~~
outer tilde fence
```
| inner | looks |
| ----- | ----- |
still inside the tilde fence
~~~

And the reverse: a three-backtick line inside an outer four-backtick fence is text, not a closing fence.

````
```
| deep | dive |
| :--: | ---- |
````

*Both outer fences above close exactly once; every line between their markers is code.*

## 5. Indented code block

Four leading spaces make this a code block even though it looks exactly like a GFM table. The aligner must ignore it entirely.

    | indented | table |
    | :------- | ----: |
    | kept     | as-is |

## 6. Paragraphs with pipes and no delimiter row

A paragraph with pipes is prose, not a table, when no delimiter row follows. None of the lines below may move.

The blending ratio is a | b and the tolerances are 0.1 | 0.2 mm.

| leading, trailing | and a lone pipe at the end|

An inline code pipe: `a | b` inside a paragraph, and a link with a pipe in its text: [pipe | link](https://example.com/p|q).

## 7. Header plus delimiter row, then a non-row paragraph

The table below has a header and a delimiter row, but the very next line is a paragraph without any pipe. The table ends at the delimiter row; the paragraph is ordinary text and the table must not be extended into it.

|  head A  |  head B  |
| -------- | -------- |
This line has no pipe and is not a table row; the table must end above it.

## 8. Thematic breaks and setext headings

Dash lines and equals lines are thematic breaks and setext headings, never table delimiters.

---

Title One
=========

Another title
-------------

And a setext heading whose text itself contains a pipe:

pipes | in setext
=================

## 9. HTML blocks and comments with pipes

HTML is never markdown: a `<div>` block, a raw `<table>` element, and comments all pass through untouched, even when their lines look like GFM tables.

<div class="trap">
  a | b inside a div
  |  fake   |  table  |
  | ------- | ------- |
</div>

<table>
<tr><td>a | b</td><td>c | d</td></tr>
</table>

<!-- comment with | pipes, --- dashes and a '>' -->

<div>
<p>| row | data |</p>
</div>

## 10. Math block with pipes

A `$$` display-math block is not a GFM table even though its lines contain pipes and one line is dash-only. The whole block must survive byte-identical.

$$
\det\begin{pmatrix} a & b \\ c & d \end{pmatrix} \neq 0
\lvert a|b \rvert = \lvert c|d \rvert
---

$$

## 11. The `a | b` followed by `---` ambiguity

A two-cell prose line directly above a dash line: GFM turns this into a one-column table (the extra header cell is dropped), while a naive parser sees a setext heading. This file records the input byte-identically.

*The aligner must pick one deliberate, documented behavior for the two lines below — this section exists so the decision is explicit rather than accidental.*

a | b
---

## 12. Table-looking line inside a list item

List-prefixed tables are unsupported. The lines below are list items and must stay exactly as written.

- | a | b |
- a normal item
- | x | y |

## 13. Blockquote beyond the supported depth

Only `> ` and `> > ` prefixes are supported. Three levels deep is out of scope and must be left alone.

> > > |  deep   |  quote  |
> > > | ------- | ------- |

## 14. Unterminated fence — the rest of the file is code

The fence below never closes. Every line from here to the end of the file is code and must pass through untouched:

```
| name | value |
| :--- | ----: |
| α    |     1 |
# this looks like a heading but it is code
- | list | inside | code |
> | quote | inside | code |
| a | b |
