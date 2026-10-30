"""Check all declared structures and semantic preconditions in chapter 4."""
import math, re

def validate(pid, text):
    assert '\x00' not in text, 'NUL byte'
    t = text.split()
    single = text.removesuffix('\n').removesuffix('\r')
    if pid in [3829,3830,3831,3832,3833]:
        assert not t, 'no input expected'
        return
    if pid==3838:
        assert single.endswith('!') and single.count('!')==1 and '\n' not in single, 'one final ASCII ! expected'
        return
    if pid==3861:
        assert '\n' not in single and re.fullmatch(r'[A-Za-z ]+',single) and 1<=len(t)<=100 and all(len(w)<=50 for w in t), 'word sequence limits'
        return
    if pid==3863:
        assert len(t)==1 and re.fullmatch('[a-z]{1,1000}',t[0]), 'lowercase string length'
        return
    if pid==3867:
        lines=text.splitlines();n=int(lines[0]);assert 1<=n<=100 and len(lines)==n+2 and all(len(s)==n and set(s)<=set('.#@') for s in lines[1:n+1]) and 1<=int(lines[-1])<=100, 'compact n by n grid required'
        return
    variable_float={3828,3842,3843,3852,3858}
    if pid not in variable_float:
        if pid in [3854,3859]:
            assert re.fullmatch(r'\d+',t[0]) and all(re.fullmatch(r'\d+',x) for x in t[2::2]), 'integer fields'
        else:
            assert all(re.fullmatch(r'[+-]?\d+' if pid==3862 else r'\d+',x) for x in t), 'integer token expected'
    fixed={3826:1,3827:1,3828:3,3834:1,3835:1,3836:1,3837:2,3839:2,3840:2,3841:2,3842:2,3843:2,3844:2,3845:2,3846:1,3847:1,3848:1,3849:1,3850:2,3851:1,3857:10,3869:1,3870:2,3872:1}
    if pid in fixed:assert len(t)==fixed[pid], 'fixed token count'
    if pid==3826:assert 2<=int(t[0])<=5000
    if pid==3827:assert 2<=int(t[0])<=50000
    if pid==3828:
        a,b,c=map(float,t);assert all(math.isfinite(x) for x in [a,b,c]) and max(a+b,b,c)*max(a,b,b+c)!=0
    if pid==3834:assert int(t[0])>=0
    if pid==3835:assert int(t[0])>=1
    if pid==3836:assert int(t[0])>0 and int(t[0])%10!=0, 'units digit must be nonzero'
    if pid==3837:assert 2<=int(t[1])<=16, 'base must be between 2 and 16'
    if pid==3839:assert 0<=int(t[0])<=3 and 0<=int(t[1])<=10
    if pid==3840:assert int(t[0])>0 and int(t[1])>0
    if pid==3841:assert int(t[0])>=0 and int(t[1])>0
    if pid in [3842,3843]:
        assert math.isfinite(float(t[0])) and re.fullmatch(r'\d+',t[1]) and int(t[1])>=1
        assert float(t[0])>=-1 if pid==3842 else float(t[0])>=0
    if pid in [3844,3845,3850]:assert all(1<=len(x)<=200 for x in t), 'integer length up to 200'
    if pid in [3845,3850]:assert all(x=='0' or not x.startswith('0') for x in t), 'no leading zero'
    if pid==3845:assert int(t[0])>int(t[1])>0, 'a > b > 0 required'
    if pid==3846:assert 1<=int(t[0])<=100
    if pid==3847:assert 1<=len(t[0])<=30
    if pid==3848:assert 0<=int(t[0])<=10000
    if pid==3849:assert 1<=int(t[0])<=50
    if pid==3851:assert 1<=len(t[0])<=100 and int(t[0])>0
    if pid==3852:
        n,k=map(int,t[:2]);assert 1<=k<=n<=100 and len(t)==2+2*n
        assert all(re.fullmatch(r'\d+',x) for x in t[2::2]);scores=list(map(float,t[3::2]));assert all(math.isfinite(x) for x in scores) and len(set(scores))==n, 'scores must be distinct'
    if pid in [3853,3860,3862]:
        n=int(t[0]);assert len(t)==n+1 and 1<=n<=(500 if pid==3853 else 100 if pid==3860 else 1000)
        a=list(map(int,t[1:]));assert all(x>0 for x in a) if pid==3853 else all(1<=x<=1000 for x in a) if pid==3860 else all(-50<x<50 for x in a)
        if pid==3853:assert any(x%2 for x in a)
    if pid==3854:
        n=int(t[0]);assert 1<=n<20 and len(t)==2*n+1 and all(re.fullmatch('[A-Za-z]{1,20}',x) for x in t[1::2]) and all(0<=int(x)<=100 for x in t[2::2])
    if pid==3855:
        n=int(t[0]);assert 5<=n<=300 and len(t)==3*n+1 and all(0<=int(x)<=100 for x in t[1:])
    if pid==3856:
        n,m=map(int,t[:2]);assert 5<=n<=5000 and 3<=m<=n and m*3//2<=n and len(t)==2*n+2
        ids=list(map(int,t[2::2]));assert len(set(ids))==n and all(1000<=x<=9999 for x in ids) and all(1<=int(x)<=100 for x in t[3::2])
    if pid==3857:assert all(0<=int(x)<=30000 for x in t)
    if pid==3858:
        n=int(t[0]);assert 2<=n<=40 and len(t)==2*n+1 and set(t[1::2])=={'male','female'}
        heights=list(map(float,t[2::2]));assert all(math.isfinite(x) and x>0 for x in heights) and len(set(heights))==n, 'heights must be distinct'
    if pid==3859:
        n=int(t[0]);assert 1<=n<100 and len(t)==2*n+1
        ids=t[1::2];assert len(set(ids))==n and all(re.fullmatch('[A-Za-z0-9]{1,9}',x) for x in ids), 'ID length less than 10'
    if pid in [3864,3865,3868]:
        n=int(t[0]);assert len(t)==1+n*(2 if pid==3868 else 1)
        if pid==3868:assert 0<=n<=20 and all(1<=int(x)<=10 for x in t[1:])
        else:assert n>=1 and all(1<=int(x)<=(1000000 if pid==3864 else 999999) for x in t[1:])
    if pid==3866:assert t and int(t[-1])==0 and all(1<=int(x)<=70 for x in t[:-1]), 'final zero and steps 1 to 70'
    if pid==3867:
        lines=text.splitlines();n=int(lines[0]);assert 1<=n<=100 and len(lines)==n+2 and all(len(s)==n and set(s)<=set('.#@') for s in lines[1:n+1]) and 1<=int(lines[-1])<=100, 'compact n by n grid required'
    if pid==3869:assert 1<=int(t[0])<20
    if pid==3870:assert all(int(x)>0 for x in t) and sum(map(int,t))<=20
    if pid==3871:
        n,k=map(int,t[:2]);assert 2<n<10000 and 2<=k<100 and len(t)==n+2 and all(0<=int(x)<=10000 for x in t[2:])
    if pid==3872:assert 1<=int(t[0])<=20
    if pid==3873:
        m,n=map(int,t[:2]);assert 1<=n<=m<500 and len(t)==m+1 and all(int(x)>0 for x in t[2:])
