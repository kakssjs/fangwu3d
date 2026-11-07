p = 'D:/lhb/i-renovation/_t1.txt'
f = open(p, 'a')
n = chr(10)
q = chr(39)
L = chr(123)
R = chr(125)
S = chr(60)
G = chr(62)
eq = chr(61)
sp = chr(32)
sl = chr(47)
d = chr(34)

lines = []
# empty state div
lines.append(sp*20 + S + 'div' + sp + 'className' + eq + d + 'panel empty-state' + d + G + S + 'p' + G + 'No open projects' + S + sl + 'p' + G + S + sl + 'div' + G)
# else open orders list
lines.append(sp*18 + ')' + sp + ':' + sp + '(')
lines.append(sp*20 + S + 'div' + sp + 'style' + eq + L + L + 'display' + eq + q + 'grid' + q + ',' + sp + 'gap' + eq + '14' + R + R + G)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
