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
ar = '=>'

lines = []
# orders tab
lines.append('')
lines.append(sp*14 + L + 'tab' + sp + eq*3 + sp + q + 'orders' + q + sp + '&&' + sp + '(')
lines.append(sp*16 + S + G)
lines.append(sp*18 + L + 'myOrders.length' + sp + eq*2 + sp + '0' + sp + '?' + sp + '(')
lines.append(sp*20 + S + 'div' + sp + 'className' + eq + d + 'panel empty-state' + d + G + S + 'p' + G + 'No orders yet' + S + sl + 'p' + G + S + sl + 'div' + G)
lines.append(sp*18 + ')' + sp + ':' + sp + '(')
lines.append(sp*20 + S + 'div' + sp + 'style' + eq + L + L + 'display' + eq + q + 'grid' + q + ',' + sp + 'gap' + eq + '14' + R + R + G)
lines.append(sp*22 + L + 'myOrders.map(o' + sp + ar + sp + '(')
lines.append(sp*24 + S + 'div' + sp + 'key' + eq + L + 'o.id' + R + sp + 'className' + eq + d + 'panel' + d + G)
# panel title
lines.append(sp*26 + S + 'div' + sp + 'className' + eq + d + 'panel-title' + d + G)
lines.append(sp*28 + S + 'div' + sp + 'className' + eq + d + 'accent-bar' + sp + sl + G)
lines.append(sp*28 + L + 'projLabel(o.projectId)' + R)
lines.append(sp*28 + S + 'small' + G + 'ORDER_' + L + 'o.id' + R + S + sl + 'small' + G)
lines.append(sp*26 + S + sl + 'div' + G)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
