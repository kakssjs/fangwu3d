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
# close order card
lines.append(sp*24 + S + sl + 'div' + G)
# close map
lines.append(sp*22 + ')' + R + ')')
# close grid
lines.append(sp*20 + S + sl + 'div' + G)
# close ternary
lines.append(sp*18 + ')' + R)
# close orders fragment
lines.append(sp*16 + S + sl + G)
# close loading ternary content fragment
lines.append(sp*12 + S + sl + G)
# close loading ternary
lines.append(sp*10 + ')' + R)
# close auth fragment
lines.append(sp*8 + S + sl + G)
# close auth ternary
lines.append(sp*6 + ')' + R)

for line in lines:
    f.write(line + n)
f.close()
print('wrote', len(lines))
