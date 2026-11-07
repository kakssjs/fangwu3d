import sys
sys.stdout.reconfigure(encoding='utf-8')
p = 'D:/lhb/i-renovation/apps/web/app/contractor/page.tsx'
c = open(p, 'r', encoding='utf-8').read()
S = chr(60)
G = chr(62)
sl = chr(47)
sp = chr(32)
old = sp+sl+S+'span'+G
new = sp+sl+G+S+'span'+G
count = c.count(old)
c = c.replace(old, new)
open(p, 'w', encoding='utf-8').write(c)
print('replaced', count, 'occurrences')
