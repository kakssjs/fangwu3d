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
# bid form conditional
lines.append(sp*26 + L + 'bidFor' + sp + eq*3 + sp + 'o.id' + sp + '&&' + sp + '(')
lines.append(sp*28 + S + 'div' + sp + 'style' + eq + L + L + 'marginTop' + eq + '12' + ',' + sp + 'padding' + eq + '12' + ',' + sp + 'borderRadius' + eq + '10' + ',' + sp + 'background' + eq + q + 'rgba(0,229,255,0.06)' + q + ',' + sp + 'border' + eq + q + '1px solid rgba(0,229,255,0.18)' + q + R + R + G)
# amount field
lines.append(sp*30 + S + 'div' + sp + 'className' + eq + d + 'form-group' + d + G)
lines.append(sp*32 + S + 'label' + G + 'Amount (CNY)' + S + sl + 'label' + G)
lines.append(sp*32 + S + 'input' + sp + 'className' + eq + d + 'form-input' + d + sp + 'value' + eq + L + 'bidAmount' + R + sp + 'onChange' + eq + L + ar + sp + 'setBidAmount(e.target.value)' + R + sp + 'placeholder' + eq + d + 'e.g. 85000' + d + sp + sl + G)
lines.append(sp*30 + S + sl + 'div' + G)
# weeks field
lines.append(sp*30 + S + 'div' + sp + 'className' + eq + d + 'form-group' + d + G)
lines.append(sp*32 + S + 'label' + G + 'Weeks' + S + sl + 'label' + G)
lines.append(sp*32 + S + 'input' + sp + 'className' + eq + d + 'form-input' + d + sp + 'value' + eq + L + 'bidWeeks' + R + sp + 'onChange' + eq + L + ar + sp + 'setBidWeeks(e.target.value)' + R + sp + 'placeholder' + eq + d + 'e.g. 6' + d + sp + sl + G)
lines.append(sp*30 + S + sl + 'div' + G)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
