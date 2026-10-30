"""Declared syntax, ranges, and semantic guarantees for chapter 5."""
from decimal import Decimal
import math, re

def prefix(tokens):
    def read(i):
        assert i<len(tokens), 'incomplete prefix expression'
        op=tokens[i]
        if op in ['+','-','*','/']:
            a,j=read(i+1);b,j=read(j)
            assert op!='/' or b!=0, 'division by zero'
            return a+b if op=='+' else a-b if op=='-' else a*b if op=='*' else a/b,j
        a=Decimal(op);assert a.is_finite(), 'finite operand expected'
        return a,i+1
    return read(0)

def validate(pid,text):
    assert '\x00' not in text, 'NUL byte'
    t=text.split();ints=lambda a:list(map(int,a))
    if pid in [3889,3916]:assert not t, 'no input expected';return
    if pid==3874:
        value,end=prefix(t);assert end==len(t), 'trailing tokens after complete expression';assert value.is_finite();return
    if pid==3875:assert len(t)==1 and re.fullmatch('[a-z]{1,6}',t[0]) and ''.join(sorted(set(t[0])))==t[0], 'sorted distinct lowercase letters';return
    if pid==3879:
        lines=text.splitlines();assert lines and all(re.fullmatch('[()A-Za-z]{1,100}',s) for s in lines), 'parentheses and letters, length at most 100';return
    if pid==3881:
        assert len(t)==4 and 1<=int(t[0])<20 and all(re.fullmatch('[A-Za-z]',s) for s in t[1:]) and len(set(t[1:]))==3;return
    if pid==3885:
        n=int(t[0]);assert 1<=n<=10 and len(t)==n+1
        for s in t[1:]:assert re.fullmatch(r'\d+/\d+',s) and all(1<=x<=10 for x in ints(s.split('/')))
        return
    if pid==3887:
        assert re.fullmatch(r'\s*\d+\s*,\s*\d+\s*',text), 'comma-separated k,x required'
        k,x=ints(text.split(','));assert 0<=k<2**32 and 0<=x<=100000;return
    if pid in [3888,3891,3892,3893]:
        i=0;cases=int(t[i]) if pid==3891 else None
        if cases is not None:assert cases>=1;i+=1
        seen=0;ended=False
        while i<len(t):
            if pid==3888:r,c=ints(t[i:i+2]);i+=2;assert seen==0 and 1<=r<=20 and 1<=c<=20
            elif pid==3891:r=int(t[i]);c=r;i+=1;assert 1<=r<=100
            elif pid==3892:
                c,r=ints(t[i:i+2]);i+=2
                if r==c==0:ended=True;break
                assert 1<=r<=20 and 1<=c<=20
            else:
                r,k=ints(t[i:i+2]);c=r;i+=2
                if r==k==-1:ended=True;break
                assert 1<=k<=r<=8
            g=t[i:i+r];i+=r;assert len(g)==r and all(len(s)==c for s in g), 'compact rectangular grid required'
            alphabet=set('ABCDEFGHIJKLMNOPQRSTUVWXYZ') if pid==3888 else set('.#@') if pid==3892 else set('.#')
            assert all(set(s)<=alphabet for s in g), 'grid alphabet'
            if pid==3891:
                q=ints(t[i:i+4]);i+=4;assert len(q)==4 and all(0<=x<r for x in q)
            if pid==3892:assert sum(s.count('@') for s in g)==1, 'exactly one starting tile'
            if pid==3893:assert all('#' in s for s in g) and all(any(g[a][b]=='#' for a in range(r)) for b in range(c)), 'no empty chessboard row or column'
            seen+=1
        assert i==len(t), 'trailing grid data'
        assert seen==cases if cases is not None else seen==1 if pid==3888 else ended, 'case count or end sentinel'
        return
    if pid==3896:
        n=int(t[0]);assert 1<=n<=20 and len(t)==n+2 and all(re.fullmatch('[A-Za-z]{1,20}',s) for s in t[1:-1]) and re.fullmatch('[A-Za-z]',t[-1]) and any(s.startswith(t[-1]) for s in t[1:-1]);return
    if pid==3900:
        count=int(t[0]);assert count>=1;i=1
        for _ in range(count):
            w,s=ints(t[i:i+2]);i+=2;assert 1<=w<=10000 and 1<=s<=100
            a=ints(t[i:i+2*s]);i+=2*s;assert len(a)==2*s and all(1<=x<=10000 for x in a)
        assert i==len(t);return
    if pid==3902:
        i=0;ended=False
        while i<len(t):
            n=int(t[i]);i+=1
            if n==0:ended=True;break
            assert 1<=n<=10000 and i+2*n<=len(t);pairs=t[i:i+2*n];i+=2*n
            assert all(Decimal(v).is_finite() and Decimal(v)>0 for v in pairs[::2]) and all(re.fullmatch(r'[+-]?\d+',s) for s in pairs[1::2]) and any(int(s)>=0 for s in pairs[1::2]), 'positive speeds and an available companion'
        assert ended and i==len(t);return
    if pid in [3913,3921]:
        assert len(t)==(4 if pid==3913 else 3);a=list(map(Decimal,t));assert all(x.is_finite() for x in a)
        if pid==3921:assert min(a)>=0 and a[1]*a[2]<=Decimal('.5')
        else:
            from importlib.util import spec_from_file_location,module_from_spec
            from pathlib import Path
            spec=spec_from_file_location('cubic_validator',Path(__file__).with_name('oracle-chapter5.py'));m=module_from_spec(spec);spec.loader.exec_module(m)
            roots=m.cubic(t);assert len(roots)==3 and all(-100-1e-12<=x<=100+1e-12 for x in roots) and all(roots[j+1]-roots[j]>=1-1e-12 for j in range(2)), 'three distinct roots in [-100,100], at least one apart'
        return
    if pid==3917:
        n,k=ints(t[:2]);assert 1<=n<=10000 and 1<=k<=10000 and len(t)==n+2
        assert all(re.fullmatch(r'\d+\.\d{2}',s) and 1<=Decimal(s)<=100000 for s in t[2:]), 'lengths in meters with exactly two decimals';return
    assert t and all(re.fullmatch(r'[+-]?\d+',s) for s in t), 'integer tokens expected'
    v=ints(t)
    if pid in [3876,3877,3878,3882,3890,3895,3906,3909]:
        n=v[0];a=v[1:];assert n>=0 if pid==3882 else n>=1
        if pid in [3876,3877,3878,3890,3909]:assert len(a)==n
        if pid==3876:assert all(1<x<32768 for x in a)
        if pid==3877:assert all(1<=x<=20 for x in a)
        if pid==3878:assert all(1<=x<1000000 for x in a)
        if pid==3882:assert n<=20 and len(a)==2*n and all(1<=x<=10 for x in a)
        if pid==3890:assert all(1<=x<=92 for x in a)
        if pid==3895:
            assert n<10 and len(a)==4*n
            for j in range(n):r,c,x,y=a[4*j:4*j+4];assert 1<=r<=5 and 1<=c<=5 and 0<=x<r and 0<=y<c
        if pid==3906:
            assert len(a)==2*n
            for x,k in zip(t[1::2],v[2::2]):assert 0<int(x)<1000000000 and '0' not in x and 0<k<len(x)
        if pid==3909:assert n<=200 and all(x>0 and len(s)<=200 for x,s in zip(a,t[1:]))
        return
    if pid==3880:assert all(1<=x<=30 for x in v);return
    if pid==3883:assert len(v)==2 and all(1<=x<1000000000 for x in v);return
    if pid==3884:assert len(v)==1 and 1<=v[0]<=20000;return
    if pid==3886:assert len(v)==1 and 2<=v[0]<100;return
    if pid==3894:assert len(v)%2==0 and v[-2:]==[0,0] and all(x>0 for x in v[:-2]);return
    if pid==3898:assert v[-1]==0 and all(1<=x<=1000000 for x in v[:-1]);return
    if pid==3901:assert len(v)%6==0 and v[-6:]==[0]*6 and all(x>=0 for x in v) and all(any(v[j:j+6]) for j in range(0,len(v)-6,6));return
    if pid in [3904,3907]:
        i=1 if pid==3907 else 0;count=v[0] if pid==3907 else None;seen=0
        if count is not None:assert count>=1
        while i<len(v):
            n=v[i];i+=1;assert 2<=n<=1000 if pid==3904 else n>=1
            a=v[i:i+n];i+=n;assert len(a)==n and all(x>0 for x in a);seen+=1
        assert i==len(v) and (count is None or seen==count);return
    if pid==3897:assert 1<=v[0]<=10 and len(v)==v[0]+1 and all(1<=x<=10000 for x in v[1:]);return
    if pid==3899:assert 1<=v[0]<=100 and len(v)==v[0]**2+1 and all(-127<=x<=127 for x in v[1:]);return
    if pid==3903:assert 1<=v[0]<=20000 and len(v)==v[0]+2 and all(1<=x<=10000 for x in v[2:]) and 1<=v[1]<=sum(v[2:])<2000000007;return
    if pid==3905:
        assert 1<=v[0]<=100 and len(v)==2*v[0]+1 and all(0<=x<=100 for x in v[1:]) and len(set(zip(v[1::2],v[2::2])))==v[0];return
    if pid==3908:assert 1<=v[0]<=10000 and 1<=v[1]<=100 and len(v)==v[0]+2 and all(x>0 for x in v[2:]);return
    if pid==3910:assert 2<=v[0]<100000 and len(v)==v[0]+2 and 1<=v[-1]<v[0] and all(abs(x)<=100000000 for x in v[1:-1]);return
    if pid==3911:assert 3<=v[0]<=50000 and len(v)==2*v[0]+1 and all(1<=a<=b<=10000 for a,b in zip(v[1::2],v[2::2]));return
    if pid==3912:assert 1<=v[0]<=100000 and len(v)==v[0]+1 and set(v[1:])==set(range(1,v[0]+1)), 'permutation of 1 through n required';return
    if pid==3914:assert 1<=v[0]<=200000 and len(v)==v[0]+1 and all(0<=x<=1500000000 for x in v[1:]) and len(set(v[1:]))<=10000, 'at most 10000 distinct values';return
    if pid==3915:
        n=v[0];assert 1<=n<=100000 and len(v)>n+1;m=v[n+1];assert 1<=m<=10000 and len(v)==n+m+2 and all(0<=x<=1000000000 for x in v[1:n+1]+v[n+2:]) and v[1:n+1]==sorted(v[1:n+1]), 'nondecreasing sequence required';return
    if pid==3918:assert 1<=v[1]<=v[0]<=100000 and len(v)==v[0]+2 and all(1<=x<=10000 for x in v[2:]);return
    if pid==3919:assert 1<=v[0]<=100000 and len(v)==v[0]+2 and all(0<=x<=100000000 for x in v[1:-1]) and 0<=v[-1]<=2**30;return
    if pid==3920:assert 1<=v[0]<=100000 and len(v)==v[0]+1 and all(-2**31<=x<2**31 for x in v[1:]) and len(set(v[1:]))<=500, 'at most 500 distinct values';return
    if pid==3922:assert 1<=v[0]<=1000000000 and 0<=v[2]<=v[1]<=50000 and len(v)==v[1]+3 and all(0<x<v[0] for x in v[3:]) and v[3:]==sorted(set(v[3:])), 'strictly increasing interior rocks';return
    raise KeyError(pid)
