p = 'D:/lhb/i-renovation/_jsx.py'
s = open(p).read()
s += "a('              {tab === ' + chr(39) + 'projects' + chr(39) + ' && (')\n"
s += "a('                <>')\n"
s += "a('                  {openOrders.length === 0 ? (')\n"
open(p, 'w').write(s)
print('ok')
