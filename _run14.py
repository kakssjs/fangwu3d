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
# actions row
lines.append(sp*26 + S + 'div' + sp + 'style' + eq + L + L + 'display' + eq + q + 'flex' + q + ',' + sp + 'gap' + eq + '8' + ',' + sp + 'marginTop' + eq + '12' + ',' + sp + 'flexWrap' + eq + q + 'wrap' + q + R + R + G)
# confirm button
lines.append(sp*28 + L + '(o.status' + sp + eq*3 + sp + q + 'matched' + q + sp + '||' + sp + 'o.status' + sp + eq*3 + sp + q + 'homeowner_confirmed' + q + ')' + sp + '&&' + sp + '(')
lines.append(sp*30 + S + 'button' + sp + 'onClick' + eq + L + ar + sp + 'confirmOrder(o.id)' + R + sp + 'disabled' + eq + L + 'busy' + R + sp + 'className' + eq + d + 'btn btn-primary' + d + sp + 'style' + eq + L + L + 'fontSize' + eq + '12' + ',' + sp + 'padding' + eq + q + '4px 14px' + q + R + R + G)
lines.append(sp*32 + 'Confirm Order')
lines.append(sp*30 + S + sl + 'button' + G)
lines.append(sp*28 + ')')
# view contract button
lines.append(sp*28 + L + 'o.status' + sp + eq*3 + sp + q + 'confirmed' + q + sp + '&&' + sp + '(')
lines.append(sp*30 + S + 'button' + sp + 'onClick' + eq + L + ar + sp + 'viewContract(o.id)' + R + sp + 'disabled' + eq + L + 'busy' + R + sp + 'className' + eq + d + 'btn btn-primary' + d + sp + 'style' + eq + L + L + 'fontSize' + eq + '12' + ',' + sp + 'padding' + eq + q + '4px 14px' + q + R + R + G)
lines.append(sp*32 + 'View Contract')
lines.append(sp*30 + S + sl + 'button' + G)
lines.append(sp*28 + ')')
lines.append(sp*26 + S + sl + 'div' + G)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
