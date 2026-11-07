import re

src = open('D:/lhb/i-renovation/_rest.ph', encoding='utf-8').read()
LT = chr(60)
GT = chr(62)
src = src.replace('~L~', chr(123))
src = src.replace('~R~', chr(125))
src = src.replace('~Q~', chr(34))
src = src.replace('~S~', chr(39))
src = src.replace('@/@', LT + '/' + GT)
src = re.sub(r'@/([a-z]+)@', lambda m: LT + '/' + m.group(1) + GT, src)
src = src.replace(' /@', ' /' + GT)
out = []
for i, ch in enumerate(src):
    if ch == '@':
        nxt = src[i + 1] if i + 1 < len(src) else ''
        prev = src[i - 1] if i > 0 else '\n'
        if nxt.isalpha() and prev in ('\n', ' ', '\t'):
            out.append(LT)
        else:
            out.append(GT)
    else:
        out.append(ch)
src = ''.join(out)

p = 'D:/lhb/i-renovation/apps/web/app/contractor/page.tsx'
c = open(p, encoding='utf-8').read()
m = 'openOrders.length === 0 ? ('
i = c.find(m)
print('marker at', i)
head = c[:i + len(m)]
final = head + '\n' + src
if not final.endswith('\n'):
    final += '\n'
open(p, 'w', encoding='utf-8').write(final)
print('lines', final.count('\n'))
print('remaining at', final.find('@'))
