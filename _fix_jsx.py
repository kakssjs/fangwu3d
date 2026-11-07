import sys
sys.stdout.reconfigure(encoding='utf-8')
p = 'D:/lhb/i-renovation/apps/web/app/contractor/page.tsx'
lines = open(p, 'r', encoding='utf-8').read().split('\n')
n = chr(10)
R = chr(125)
S = chr(60)
G = chr(62)
ap = chr(39)

fixes = {}
fixes[429] = (R+R, ')'+R)
fixes[431] = (R+R, '))'+R)
fixes[432] = (R+R, ')'+R)
fixes[434] = (R+R, ')'+R)
fixes[437] = ('empty-state'+ap+S+'p'+G, 'empty-state'+ap+G+S+'p'+G)
fixes[440] = ('panel-title'+ap+S+'div', 'panel-title'+ap+G+S+'div')
fixes[460] = (R+R, '))'+R)
fixes[465] = (R+R, ')'+R)
fixes[468] = ('empty-state'+ap+S+'p'+G, 'empty-state'+ap+G+S+'p'+G)
fixes[489] = (R+R, ')'+R)
fixes[494] = (R+R, ')'+R)
fixes[497] = (R+R, '))'+R)
fixes[499] = (R+R, ')'+R)
fixes[503] = ('panel-title'+ap+S+'div', 'panel-title'+ap+G+S+'div')
fixes[516] = (R+R, ')'+R)
fixes[518] = (R+R, ')'+R)
fixes[520] = (R+R, ')'+R)

for idx, (old, new) in sorted(fixes.items()):
    if old in lines[idx]:
        lines[idx] = lines[idx].replace(old, new, 1)
        print('fixed', idx+1)
    else:
        print('MISS', idx+1, repr(lines[idx][:60]))

open(p, 'w', encoding='utf-8').write(n.join(lines))
print('done')
