src = open('D:/lhb/i-renovation/_rest.ph', encoding='utf-8').read()
src = src.replace(chr(126) + 'L' + chr(126), chr(123))
src = src.replace(chr(126) + 'R' + chr(126), chr(125))
src = src.replace(chr(126) + 'Q' + chr(126), chr(34))
src = src.replace(chr(126) + 'S' + chr(126), chr(39))
src = src.replace('@', chr(60))
src = src.replace('#', chr(62))
p = 'D:/lhb/i-renovation/apps/web/app/contractor/page.tsx'
c = open(p, encoding='utf-8').read()
m = 'openOrders.length === 0 ? ('
i = c.find(m)
print('marker at', i)
head = c[:i + len(m)]
out = head + chr(10) + src
if not out.endswith(chr(10)):
    out = out + chr(10)
open(p, 'w', encoding='utf-8').write(out)
print('wrote', out.count(chr(10)), 'newlines')
