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
un = chr(95)
ar = '=>'

lines = []
# project meta paragraph
lines.append(sp*26 + S + 'p' + sp + 'style' + eq + L + L + 'color' + eq + q + 'var(--text-dim)' + q + ',' + sp + 'fontSize' + eq + '12' + ',' + sp + 'margin' + eq + q + '6px 0 10px' + q + R + R + G + L + 'projMeta(o.projectId)' + R + S + sl + 'p' + G)
# action row
lines.append(sp*26 + S + 'div' + sp + 'style' + eq + L + L + 'display' + eq + q + 'flex' + q + ',' + sp + 'gap' + eq + '8' + ',' + sp + 'alignItems' + eq + q + 'center' + q + ',' + sp + 'flexWrap' + eq + q + 'wrap' + q + R + R + G)
lines.append(sp*28 + L + 'orderStatusTag(o.status)' + R)
# bid button
lines.append(sp*28 + S + 'button' + sp + 'onClick' + eq + L + ar + sp + 'setBidFor(bidFor' + sp + eq*3 + sp + 'o.id' + sp + '?' + sp + 'null' + sp + ':' + sp + 'o.id)' + R + sp + 'className' + eq + d + 'btn btn-primary' + d + sp + 'style' + eq + L + L + 'fontSize' + eq + '12' + ',' + sp + 'padding' + eq + q + '4px 14px' + q + R + R + G)
lines.append(sp*30 + L + 'bidFor' + sp + eq*3 + sp + 'o.id' + sp + '?' + sp + q + 'Cancel' + q + sp + ':' + sp + q + 'Place Bid' + q + R)
lines.append(sp*28 + S + sl + 'button' + G)
lines.append(sp*26 + S + sl + 'div' + G)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
