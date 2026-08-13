import sys
sys.path.insert(0, '.')
import align_md_tables as A
lines = open('.work/emoji_out.md', encoding='utf-8').read().split('\n')
for start, end, t in A.find_tables(lines, 40, 8):
    for row in t.rows:
        for c in row.cells:
            if 'Hungary' in ' '.join(c):
                print('table lines', start, end)
                for ln in lines[start:end]:
                    print(repr(ln))
                break
