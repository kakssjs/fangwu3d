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
# tbody
lines.append(sp*22 + S + 'tbody' + G)
lines.append(sp*24 + L + 'myBids.map(b' + sp + ar + sp + '(')
lines.append(sp*26 + S + 'tr' + sp + 'key' + eq + L + 'b.id' + R + G)
lines.append(sp*28 + S + 'td' + G + L + 'b.projectName' + R + S + sl + 'td' + G)
lines.append(sp*28 + S + 'td' + G + L + 'b.amount' + R + S + sl + 'td' + G)
lines.append(sp*28 + S + 'td' + G + L + 'b.weeks' + R + S + sl + 'td' + G)
lines.append(sp*28 + S + 'td' + G + L + 'bidStatusTag(b.status)' + R + S + sl + 'td' + G)
lines.append(sp*28 + S + 'td' + sp + 'style' + eq + L + L + 'fontSize' + eq + '11' + ',' + sp + 'color' + eq + q + 'var(--text-dim)' + q + R + R + G + L + 'b.createdAt' + sp + '?' + sp + 'b.createdAt.slice(0,' + sp + '10)' + sp + ':' + sp + q + '-' + q + R + S + sl + 'td' + G)
lines.append(sp*26 + S + sl + 'tr' + G)
lines.append(sp*24 + ')' + R + ')')
lines.append(sp*22 + S + sl + 'tbody' + G)
lines.append(sp*20 + S + sl + 'table' + G)
lines.append(sp*18 + ')' + R)
lines.append(sp*16 + S + sl + G)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
