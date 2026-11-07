import os
p = 'D:/lhb/i-renovation/_t1.txt'
f = open(p, 'a')
n = chr(10)
q = chr(39)
L = chr(123)
R = chr(125)
G = chr(62)
S = chr(60)
eq = chr(61)
sp = chr(32)
# Build JSX lines using chr codes only
lines = []
lines.append(sp*14 + L + 'tab' + sp + eq*3 + sp + q + 'projects' + q + sp + '&' * 2 + sp + '(')
lines.append(sp*16 + S + G)
lines.append(sp*18 + L + 'openOrders.length' + sp + eq*2 + sp + '0' + sp + '?' + sp + '(')
for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
