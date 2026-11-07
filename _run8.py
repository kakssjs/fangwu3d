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
# note field
lines.append(sp*30 + S + 'div' + sp + 'className' + eq + d + 'form-group' + d + G)
lines.append(sp*32 + S + 'label' + G + 'Note' + S + sl + 'label' + G)
lines.append(sp*32 + S + 'input' + sp + 'className' + eq + d + 'form-input' + d + sp + 'value' + eq + L + 'bidNote' + R + sp + 'onChange' + eq + L + ar + sp + 'setBidNote(e.target.value)' + R + sp + 'placeholder' + eq + d + 'Optional' + d + sp + sl + G)
lines.append(sp*30 + S + sl + 'div' + G)
# submit button
lines.append(sp*30 + S + 'button' + sp + 'onClick' + eq + L + ar + sp + 'submitBid(o.id)' + R + sp + 'disabled' + eq + L + 'busy' + sp + '||' + sp + '!bidAmount.trim()' + sp + '||' + sp + '!bidWeeks.trim()' + R + sp + 'className' + eq + d + 'btn btn-primary' + d + sp + 'style' + eq + L + L + 'fontSize' + eq + '12' + R + R + G)
lines.append(sp*32 + L + 'busy' + sp + '?' + sp + q + 'Submitting...' + q + sp + ':' + sp + q + 'Submit Bid' + q + R)
lines.append(sp*30 + S + sl + 'button' + G)
# close bid form
lines.append(sp*28 + S + sl + 'div' + G)
lines.append(sp*26 + ')' + R)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
