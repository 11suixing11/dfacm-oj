"""Independent Python calculations for the language-basics chapter."""
from decimal import Decimal, localcontext
import math
import struct

def float32(text):
    return struct.unpack('f',struct.pack('f',float(text)))[0]

def trunc_div(a,b):
    return (1 if a*b>=0 else -1)*(abs(a)//abs(b))

def solve(pid,text):
    if 4023<=pid<=4071:
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        global _chapter8
        if '_chapter8' not in globals():
            spec=spec_from_file_location('chapter8',Path(__file__).with_name('oracle-chapter8.py'));_chapter8=module_from_spec(spec);spec.loader.exec_module(_chapter8)
        return _chapter8.solve(pid,text)
    if 3973<=pid<=4022:
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        global _chapter7
        if '_chapter7' not in globals():
            spec=spec_from_file_location('chapter7',Path(__file__).with_name('oracle-chapter7.py'));_chapter7=module_from_spec(spec);spec.loader.exec_module(_chapter7)
        return _chapter7.solve(pid,text)
    if 3923<=pid<=3972:
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        global _chapter6
        if '_chapter6' not in globals():
            spec=spec_from_file_location('chapter6',Path(__file__).with_name('oracle-chapter6.py'));_chapter6=module_from_spec(spec);spec.loader.exec_module(_chapter6)
        return _chapter6.solve(pid,text)
    if 3874<=pid<=3922:
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        global _chapter5
        if '_chapter5' not in globals():
            spec=spec_from_file_location('chapter5',Path(__file__).with_name('oracle-chapter5.py'));_chapter5=module_from_spec(spec);spec.loader.exec_module(_chapter5)
        return _chapter5.solve(pid,text)
    if 3826<=pid<=3873:
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        global _chapter4
        if '_chapter4' not in globals():
            spec=spec_from_file_location('chapter4',Path(__file__).with_name('oracle-chapter4.py'));_chapter4=module_from_spec(spec);spec.loader.exec_module(_chapter4)
        return _chapter4.solve(pid,text)
    if 3776<=pid<=3825 or pid in [4929,4930,4931]:
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        global _chapter3
        if '_chapter3' not in globals():
            spec=spec_from_file_location('chapter3',Path(__file__).with_name('oracle-chapter3.py'));_chapter3=module_from_spec(spec);spec.loader.exec_module(_chapter3)
        return _chapter3.solve(pid,text)
    if 3726<=pid<=3775 or pid==4928:
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        global _chapter2
        if '_chapter2' not in globals():
            spec=spec_from_file_location('chapter2',Path(__file__).with_name('oracle-chapter2.py'));_chapter2=module_from_spec(spec);spec.loader.exec_module(_chapter2)
        return _chapter2.solve(pid,text)
    t=text.split()
    ints=lambda:list(map(int,t))
    f=lambda:list(map(float,t))
    if pid==3676:return str(sum(ints()))
    if pid==3677:return 'Hello,World!'
    if pid==3678:return str(int(t[1]))
    if pid==3679:return ' '.join(f'{x:8d}' for x in ints())
    if pid in [3680,3704]:
        return '\n'.join(' '*((5-n)//2)+t[0]*n for n in ([1,3,5] if pid==3680 else [1,3,5,3,1]))
    if pid==3681:
        x,a,y,b=ints()
        with localcontext() as ctx:
            ctx.prec=60
            return f'{Decimal(y*b-x*a)/Decimal(b-a):.2f}'
    if pid==3682:return '-'+t[0].lstrip('+-')
    if pid==3683:
        a,b,c=ints();return str((a+b)*c)
    if pid==3684:
        a,b,c=ints();return str(trunc_div(a+b,c))
    if pid==3685:
        a,b=ints();q=trunc_div(a,b);return f'{q} {a-q*b}'
    if pid==3686:
        a,b=f();return f'{a/b:.9f}'
    if pid==3687:
        a,b=f();return f'{100*b/a:.3f}%'
    if pid==3688:
        x,a,b,c,d=f();return f'{a*x*x*x+b*x*x+c*x+d:.7f}'
    if pid==3689:return f'{5*(float(t[0])-32)/9:.5f}'
    if pid==3690:
        r=float(t[0]);return f'{2*r:.4f} {2*3.14159*r:.4f} {3.14159*r*r:.4f}'
    if pid==3691:
        a,b=f();return f'{1/(1/a+1/b):.2f}'
    if pid==3692:return '4 2'
    if pid==3693:return '4 8'
    if pid==3694:return '1 1'
    if pid==3695:return str(int(float32(t[0])))
    if pid==3696:return str(ord(t[0]))
    if pid==3697:return chr(int(t[0]))
    if pid==3698:return str(int(int(t[0])!=0))
    if pid==3699:return '14'
    if pid==3700:return f'{float32(t[0]):.3f}'
    if pid==3701:return f'{float(t[0]):.12f}'
    if pid==3702:return f'{t[0]} {int(t[1])} {float32(t[2]):.6f} {float(t[3]):.6f}'
    if pid==3703:
        x=float(t[0]);return f'{x:f}\n{x:.5f}\n{x:e}\n{x:g}'
    if pid==3705:
        a,b=f();return f'{a%b:g}'
    if pid==3706:
        r=float(t[0]);return f'{4*3.14*r*r*r/3:.2f}'
    if pid==3707:return t[0][::-1]
    if pid==3708:
        h,r=ints();return str(math.ceil(20000/(3.14159*r*r*h)))
    if pid==3709:
        x1,y1,x2,y2=f();return f'{math.hypot(x1-x2,y1-y2):.3f}'
    if pid==3710:
        x1,y1,x2,y2,x3,y3=f();return f'{abs((x2-x1)*(y3-y1)-(x3-x1)*(y2-y1))/2:.2f}'
    if pid==3711:
        a,b,n=ints();return str(a+(n-1)*(b-a))
    if pid==3712:
        a,b=ints();return str(a*b)
    if pid==3713:return str(2**int(t[0]))
    if pid==3714:
        n,x,y=ints();return str(max(0,n-(y+x-1)//x))
    if pid==3715:
        x=int(t[0]);return 'positive' if x>0 else 'negative' if x<0 else 'zero'
    if pid==3716:return f'{abs(float(t[0])):.2f}'
    if pid==3717:return 'odd' if int(t[0])%2 else 'even'
    if pid==3718:return 'YES' if ord(text[0])%2 else 'NO'
    if pid==3719:
        a,b=ints();return '>' if a>b else '<' if a<b else '='
    if pid==3720:return str(int(10<=int(t[0])<=99))
    if pid==3721:
        a,b=ints();return str(int(a>=10 or b>=20))
    if pid==3722:return 'YES' if int(t[0])%15==0 else 'NO'
    if pid==3723:return ' '.join(str(d) for d in [3,5,7] if int(t[0])%d==0) or 'n'
    if pid==3724:
        a,b=ints();return str(int((a<60)!=(b<60)))
    if pid==3725:return 'NO' if int(t[0]) in [1,3,5] else 'YES'
    raise KeyError(pid)
