import sys
sys.path.insert(0, '.')
import align_md_tables as A
import shutil, tempfile, subprocess, os

def aligned(path):
    with tempfile.TemporaryDirectory() as tmp:
        work = os.path.join(tmp, os.path.basename(path))
        shutil.copyfile(path, work)
        r = subprocess.run([sys.executable, 'align_md_tables.py', work], capture_output=True)
        return open(work, encoding='utf-8').read()

for name in ['emoji-hell.md']:
    out = aligned('tests/' + name)
    lines = out.split('\n')
    for start, end, t in A.find_tables(lines, 40, 8):
        for row in t.rows:
            for j, frags in enumerate(row.cells):
                for f in frags:
                    w = A.display_width(f)
                    if w > 40:
                        print('table', start, 'cell', j, 'frag %r width %d' % (f, w))
                        for ln in lines[start:end]:
                            print('   ', repr(ln))
                        break
