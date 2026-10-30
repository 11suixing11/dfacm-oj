"""Chapter 2 token, range and mathematical feasibility checks."""
from decimal import Decimal
import math, re

def validate(pid,text):
    assert '\x00' not in text,'NUL byte in text';t=text.split();iv=lambda:list(map(int,t))
    mixed={3728,3733,3773};floating={3727,3734,3736,3749,3769}
    if pid not in mixed|floating:assert all(re.fullmatch(r'[+-]?\d+',s) for s in t),'integer token expected'
    if pid in floating:assert all(math.isfinite(float(s)) for s in t),'finite number required'
    fixed={3726:1,3727:1,3728:2,3729:3,3730:3,3731:1,3732:2,3733:3,3734:3,3741:2,3742:2,3745:2,3746:2,3747:1,4928:12,3754:1,3755:1,3756:3,3757:1,3758:3,3759:2,3760:2,3761:1,3762:1,3763:1,3764:1,3765:1,3766:2,3767:1,3768:1,3769:2,3770:1,3771:1,3772:2,3773:4,3774:1,3775:1}
    if pid in fixed:assert len(t)==fixed[pid],f'{fixed[pid]} tokens expected'
    if pid==3726:assert int(t[0])>=0
    if pid==3727:assert 0<=float(t[0])<20
    if pid==3728:assert re.fullmatch(r'\d+',t[0]) and int(t[0])>0 and t[1] in ['y','n']
    if pid==3729:assert all(-2**31<=x<2**31 for x in iv())
    if pid==3730:assert all(x>0 for x in iv())
    if pid==3731:assert 0<int(t[0])<3000
    if pid==3733:
        a,b=map(int,t[:2]);op=t[2];assert len(op)==1 and all(-2**31<=x<2**31 for x in [a,b])
        if op in '+-*/' and not(op=='/' and b==0):
            ans=a+b if op=='+' else a-b if op=='-' else a*b if op=='*' else (1 if a*b>=0 else -1)*(abs(a)//abs(b))
            assert -2**31<=ans<2**31,'result outside int range'
    if pid==3734:assert float(t[0])!=0
    bounds={3735:(1,100),3736:(1,99),3737:(1,10000),3738:(1,99),3739:(1,1000),3740:(1,17),3743:(2,99),3744:(0,100),3748:(2,20),3749:(0,100000),3752:(1,99),3753:(1,100)}
    if pid in bounds:
        assert t and re.fullmatch(r'\d+',t[0]);n=int(t[0]);assert bounds[pid][0]<=n<=bounds[pid][1]
        step=3 if pid in [3740,3749] else 2 if pid in [3748,3752] else 1;head=2 if pid==3744 else 1
        assert len(t)==head+n*step,'array length mismatch'
        vals=list(map(float if pid in [3736,3749] else int,t[head:]))
        if pid==3735:assert all(15<=x<=25 for x in vals)
        if pid==3736:assert all(abs(x)<=1000 for x in vals)
        if pid==3737:assert all(abs(x)<=10000 for x in vals)
        if pid==3738:assert all(0<=x<=100 for x in vals)
        if pid==3739:assert all(0<=x<=1000 for x in vals)
        if pid==3740:assert all(x>=0 for x in vals)
        if pid==3743:assert all(1<=x<=10 for x in vals)
        if pid==3748:assert all(1<=a<=10000 and 0<=b<=a for a,b in zip(vals[::2],vals[1::2]))
        if pid==3749:assert all(x>=0 and x==int(x) for x in vals[2::3])
        if pid==3752:assert all(x>0 for x in vals)
        if pid==3753:assert all(1000<=x<=9999 for x in vals)
    if pid==3741:
        a,b=iv();assert 0<=a<=b<=300
    if pid==3742:
        a,b=iv();assert 0<a<b<1000
    if pid==3745:
        a,n=iv();assert abs(a)<=10**6 and 1<=n<=10000 and abs(a**n)<=10**6
    if pid==3746:assert all(1<=x<=100 for x in iv())
    if pid==3747:assert 1<int(t[0])+1<=47
    if pid==4928:assert all(0<=x<350 for x in iv())
    if pid==3751:
        m,n,*v=iv();assert m>=0 and 1<=n<=100 and len(v)==n and all(x>=0 for x in v)
    if pid==3754:assert 1<=int(t[0])<=30
    if pid==3755:assert 1<=int(t[0])<=1000
    if pid==3756:
        a,b,c=iv();assert all(1<=x<=10**6 for x in [a,b,c]);g=math.gcd(a-b,a-c);assert g==0 or g>=2,'no solution with divisor >1'
    if pid==3757:assert 1<=int(t[0])<=1000
    if pid==3758:
        a,b,n=iv();assert 0<a<b<100 and 1<=n<=10000
    if pid in [3759,3760]:
        a,b=iv();assert 1<=a<=100 and 1<=b<=10000
    if pid==3761:assert int(t[0])>=0
    if pid==3762:assert 1<=int(t[0])<=2000000
    if pid==3763:assert 1<=int(t[0])<=15
    if pid==3764:assert 1<=int(t[0])<=100000000
    if pid==3765:assert abs(int(t[0]))<=1000000000
    if pid==3766:
        m,k=iv();assert 1<m<100000 and 1<k<5
    if pid==3767:assert 1<int(t[0])<12
    if pid==3768:assert 2<=int(t[0])<=15
    if pid==3769:
        from importlib.util import spec_from_file_location,module_from_spec
        from pathlib import Path
        x=Decimal(t[0]);n=int(t[1]);assert re.fullmatch(r'\d+',t[1]) and 1<=n<=1000000
        assert abs(x)<=Decimal('1.7976931348623157e308')
        spec=spec_from_file_location('oracle_ch2',Path(__file__).with_name('oracle-chapter2.py'));mod=module_from_spec(spec);spec.loader.exec_module(mod)
        assert abs(mod.polynomial(t[0],n))<=Decimal('1.7976931348623157e308'),'polynomial outside double range'
    if pid==3770:assert 1<=int(t[0])<100
    if pid==3771:assert 1<=int(t[0])<=10000
    if pid==3772:
        l,r=iv();assert 1<=l<=r
    if pid==3773:
        h,w,c,solid=t;assert 3<=int(h)<=10 and 5<=int(w)<=10 and len(c)==1 and 33<=ord(c)<=126 and solid in ['0','1']
    if pid==3774:
        n=int(t[0]);assert 6<=n<=2*10**9
        def prime(x):return x>1 and all(x%d for d in range(2,math.isqrt(x)+1))
        small=next((d for d in range(2,math.isqrt(n)+1) if n%d==0),None)
        assert small and small!=n//small and prime(small) and prime(n//small),'two different primes required'
    if pid==3775:assert 1<=int(t[0])<=10000
