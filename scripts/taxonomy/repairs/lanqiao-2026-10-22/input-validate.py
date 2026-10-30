"""Check source input constraints without trusting an existing accepted program."""
import re
from decimal import Decimal

def validate(pid,text):
    tokens=text.split()
    def integers():
        assert all(re.fullmatch(r'-?\d+',x) for x in tokens),'non-integer token'
        return list(map(int,tokens))
    if pid==4072:
        t=integers();n=t[0];assert 1<=n<=8 and len(t)==1+n*n and all(x in (0,1) for x in t[1:])
    elif pid==4073:
        t=integers();assert len(t)==1 and 1<=t[0]<=26
    elif pid==4074:
        t=integers();assert 1<=t[0]<=100 and len(t)==1+t[0] and all(1<=x<=1000 for x in t[1:])
    elif pid==4075:
        t=integers();assert len(t)==2 and 2<=t[0]<=t[1]<=10000
    elif pid==4076:
        t=integers();m,n=t[:2];assert 1<=m<=200 and 1<=n<=200 and len(t)==2+m*n
        assert all(-2147483648<=x<=2147483647 for x in t[2:])
    elif pid==4077:
        assert len(tokens)==2 and all(re.fullmatch('[A-Za-z]{1,10}',x) for x in tokens)
    elif pid==4078:
        assert len(tokens)==2 and re.fullmatch(r'\d+',tokens[0]) and 1<=int(tokens[0])<=8000
        assert re.fullmatch('[a-z]+',tokens[1]) and len(tokens[1])==int(tokens[0])
    elif pid==4079:
        t=integers();assert len(t)==2 and 0<=t[0]<24 and 0<=t[1]<60
    elif pid==4080:
        assert tokens and all(re.fullmatch(r'\d+',x) for x in tokens)
        assert 0<=int(''.join(tokens))<=2000000000
    elif pid==4081:
        t=integers();assert len(t)==1 and 0<=t[0]<=86399
    elif pid==4082:
        assert len(tokens)==8
        assert all(re.fullmatch(r'-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?',x) for x in tokens)
        assert all(Decimal(x).is_finite() and abs(Decimal(x))<=10**7 for x in tokens)
    elif pid==4083:
        t=integers();n,m=t[:2];assert 1<=n<=30 and 0<=m<=5 and len(t)==2+n*n and all(0<=x<=10 for x in t[2:])
    elif pid==4084:
        t=integers();n=t[0];assert 2<=n<=20 and len(t)==1+n*n and all(x in (0,1) for x in t[1:])
        a=[t[1+i*n:1+(i+1)*n] for i in range(n)]
        assert all(a[i][i]==1 for i in range(n)),'self-test diagonal'
        good=[sum(row[j] for row in a)>n//2 for j in range(n)]
        assert sum(good)>n//2,'no legal good-chip majority'
        assert all(all(bool(a[i][j])==good[j] for j in range(n) if i!=j) for i in range(n) if good[i]),'inconsistent good-chip reports'
    elif pid==4085:
        assert len(tokens)==2 and all(re.fullmatch(r'(?:0|[1-9]\d{0,99})',x) for x in tokens)
    elif pid==4086:
        t=integers();assert len(t)==5
        v1,v2,threshold,rest,length=t
        assert 1<=v1<=100 and 1<=v2<=100 and 1<=threshold<=300 and 1<=rest<=10 and 1<=length<=10000
        assert length%v1==length%v2==0,'track length is not a common multiple'
    else:raise KeyError(pid)
    return True
