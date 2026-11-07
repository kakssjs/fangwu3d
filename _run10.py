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
# bids tab
lines.append('')
lines.append(sp*14 + L + 'tab' + sp + eq*3 + sp + q + 'bids' + q + sp + '&&' + sp + '(')
lines.append(sp*16 + S + G)
lines.append(sp*18 + L + 'myBids.length' + sp + eq*2 + sp + '0' + sp + '?' + sp + '(')
lines.append(sp*20 + S + 'div' + sp + 'className' + eq + d + 'panel empty-state' + d + G + S + 'p' + G + 'No bids yet' + S + sl + 'p' + G + S + sl + 'div' + G)
lines.append(sp*18 + ')' + sp + ':' + sp + '(')
# bids table
lines.append(sp*20 + S + 'table' + sp + 'className' + eq + d + 'data-table' + d + G)
lines.append(sp*22 + S + 'thead' + G)
lines.append(sp*24 + S + 'tr' + G + S + 'th' + G + 'Project' + S + sl + 'th' + G + S + 'th' + G + 'Amount' + S + sl + 'th' + G + S + 'th' + G + 'Weeks' + S + sl + 'th' + G + S + 'th' + G + 'Status' + S + sl + 'th' + G + S + 'th' + G + 'Date' + S + sl + 'th' + G + S + sl + 'tr' + G)
lines.append(sp*22 + S + sl + 'thead' + G)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
