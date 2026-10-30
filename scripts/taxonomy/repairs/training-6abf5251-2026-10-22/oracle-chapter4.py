"""Python integer, decimal and DP oracles independent of the C++ references."""
from collections import Counter, deque
from decimal import Decimal, localcontext
from functools import lru_cache
import math, sys
if hasattr(sys,'set_int_max_str_digits'):sys.set_int_max_str_digits(0)

def prime(x):return x>=2 and all(x%d for d in range(2,math.isqrt(x)+1))
def divisors(x):return sum(d for d in range(1,x) if x%d==0)
@lru_cache(None)
def fib(n):
    if n==0:return 0,1
    a,b=fib(n//2);c=a*(2*b-a);d=a*a+b*b
    return (d,c+d) if n%2 else (c,d)
@lru_cache(None)
def modfib(n):
    if n==0:return 0,1
    a,b=modfib(n//2);c=a*(2*b-a)%1000;d=(a*a+b*b)%1000
    return (d,(c+d)%1000) if n%2 else (c,d)
def pell(k):
    result=(1,0,0,1);base=(2,1,1,0)
    def mul(a,b):return tuple(sum(a[i*2+t]*b[t*2+j] for t in range(2))%32767 for i in range(2) for j in range(2))
    while k:
        if k%2:result=mul(result,base)
        base=mul(base,base);k//=2
    return result[1]

def school_cost(m,n,gaps):
    x=[0]
    for d in gaps:x.append(x[-1]+d)
    prefix=[0]
    for v in x:prefix.append(prefix[-1]+v)
    costs=[[0]*(m+1) for _ in range(m+1)]
    for l in range(m):
        for r in range(l+1,m+1):
            p=(l+r-1)//2
            costs[l][r]=x[p]*(p-l)-(prefix[p]-prefix[l])+(prefix[r]-prefix[p+1])-x[p]*(r-p-1)
    old=[0]+[10**30]*m
    # Monge divide and conquer has different transition traversal from C++.
    for k in range(1,n+1):
        new=[10**30]*(m+1)
        def fill(lo,hi,left,right):
            if lo>hi:return
            mid=(lo+hi)//2
            value,index=min((old[j]+costs[j][mid],j) for j in range(left,min(mid-1,right)+1))
            new[mid]=value;fill(lo,mid-1,left,index);fill(mid+1,hi,index,right)
        fill(k,m,k-1,m-1);old=new
    return str(old[m])

def solve(pid,text):
    t=text.split();v=lambda:list(map(int,t))
    if pid==3826:return '\n'.join(str(x) for x in range(2,int(t[0])+1) if divisors(x)==x)
    if pid==3827:return str(sum(prime(x) for x in range(2,int(t[0])+1)))
    if pid==3828:
        a,b,c=map(Decimal,t)
        with localcontext() as ctx:ctx.prec=60;return f'{max(a,b,c)/(max(a+b,b,c)*max(a,b,b+c)):.3f}'
    if pid==3829:return '\n'.join(str(x) for x in range(10,100) if prime(x) and prime(int(str(x)[::-1])))
    if pid==3830:
        a=2
        while True:
            b=divisors(a)
            if a<b and divisors(b)==a:return f'{a} {b}'
            a+=1
    if pid==3831:return '\n'.join(str(x) for x in range(100,1000) if str(x)==str(x)[::-1] and prime(x))
    if pid==3832:
        with localcontext() as ctx:
            ctx.prec=70;x=Decimal(1)/Decimal(3).sqrt();s=Decimal(0);k=0
            while abs((term:=(-1)**k*x**(2*k+1)/(2*k+1)))>=Decimal('1e-6'):s+=term;k+=1
            return f'{6*s:.10f}'
    if pid==3833:return '\n'.join(f'{n}={a}+{n-a}' for n in range(6,101,2) for a in [next(x for x in range(2,n//2+1) if prime(x) and prime(n-x))])
    if pid==3834:return str(int(t[0])*(int(t[0])+1)//2)
    if pid==3835:return str(fib(int(t[0])-1)[0])
    if pid==3836:return t[0][::-1]
    if pid==3837:
        n,m=v();s=''
        while n:s='0123456789ABCDEF'[n%m]+s;n//=m
        return s or '0'
    if pid==3838:return text.split('!',1)[0][::-1]
    if pid==3839:
        m,n=v();return str(n+1 if m==0 else n+2 if m==1 else 2*n+3 if m==2 else 2**(n+3)-3)
    if pid==3840:
        n,k=t;return n[-int(k)] if int(k)<=len(n) else '0'
    if pid==3841:
        n,x=v();value=sum((-1)**k*math.factorial(n)//(math.factorial(k)*math.factorial(n-2*k))*(2*x)**(n-2*k) for k in range(n//2+1));return f'{value}.00'
    if pid in [3842,3843]:
        with localcontext() as ctx:
            ctx.prec=80;x=Decimal(t[0]);n=int(t[1]);f=x
            for k in range(1,n+1):f=(k+f).sqrt() if pid==3842 else x/(k+f)
            return f'{f:.2f}'
    if pid==3844:return str(sum(v()))
    if pid==3845:return str(int(t[0])-int(t[1]))
    if pid==3846:return str(2**int(t[0]))
    if pid==3847:return ' '.join(str(k) for k in range(2,10) if int(t[0])%k==0) or 'none'
    if pid==3848:return str(math.factorial(int(t[0])))
    if pid==3849:return str(sum(math.factorial(k) for k in range(1,int(t[0])+1)))
    if pid==3850:return str(math.prod(v()))
    if pid==3851:
        q,r=divmod(int(t[0]),13);return f'{q}\n{r}'
    if pid==3852:
        n,k=map(int,t[:2]);a=sorted(zip(map(float,t[3::2]),map(int,t[2::2])),reverse=True);s,i=a[k-1];return f'{i} {s:g}'
    if pid==3853:return ','.join(map(str,sorted(x for x in v()[1:] if x%2)))
    if pid==3854:return '\n'.join(f'{name} {s}' for name,s in sorted(zip(t[1::2],map(int,t[2::2])),key=lambda a:(-a[1],a[0])))
    if pid==3855:
        a=[(sum(map(int,t[1+3*i:4+3*i])),int(t[1+3*i]),i+1) for i in range(int(t[0]))];a=sorted(a,key=lambda x:(-x[0],-x[1],x[2]));return '\n'.join(f'{i} {s}' for s,c,i in a[:5])
    if pid==3856:
        n,m=map(int,t[:2]);a=sorted(zip(map(int,t[2::2]),map(int,t[3::2])),key=lambda p:(-p[1],p[0]));cut=a[m*3//2-1][1];out=[p for p in a if p[1]>=cut];return f'{cut} {len(out)}\n'+'\n'.join(f'{i} {s}' for i,s in out)
    if pid==3857:return ' '.join(map(str,sorted(v(),key=lambda x:(1-x%2,-x if x%2 else x))))
    if pid==3858:
        a=sorted(zip(t[1::2],map(float,t[2::2])),key=lambda p:(0 if p[0]=='male' else 1,p[1] if p[0]=='male' else -p[1]));return ' '.join(f'{h:.2f}' for sex,h in a)
    if pid==3859:
        a=list(zip(t[1::2],map(int,t[2::2])));a=sorted(enumerate(a),key=lambda p:(0 if p[1][1]>=60 else 1,-p[1][1] if p[1][1]>=60 else p[0],p[0]));return '\n'.join(p[1][0] for p in a)
    if pid==3860:
        a=sorted(set(v()[1:]));return str(len(a))+'\n'+' '.join(map(str,a))
    if pid==3861:return '\n'.join(sorted(set(t)))
    if pid==3862:
        c=Counter(v()[1:]);return next((str(x) for x,count in c.items() if count>int(t[0])/2),'no')
    if pid==3863:
        c=Counter(t[0]);x=min(c,key=lambda a:(-c[a],a));return f'{x} {c[x]}'
    if pid==3864:return '\n'.join(str(modfib(int(a))[0]) for a in t[1:])
    if pid==3865:return '\n'.join(str(pell(int(k))) for k in t[1:])
    if pid==3866:
        @lru_cache(None)
        def stairs(n):return int(n==0) if n<=0 else sum(stairs(n-i) for i in [1,2,3])
        return '\n'.join(str(stairs(int(n))) for n in t[:-1])
    if pid==3867:
        lines=text.splitlines();n=int(lines[0]);m=int(lines[-1]);grid=lines[1:n+1];dist={};q=deque()
        for i in range(n):
            for j in range(n):
                if grid[i][j]=='@':dist[i,j]=1;q.append((i,j))
        while q:
            i,j=q.popleft()
            if dist[i,j]>=m:continue
            for r,c in [(i+1,j),(i-1,j),(i,j+1),(i,j-1)]:
                if 0<=r<n and 0<=c<n and grid[r][c]!='#' and (r,c) not in dist:dist[r,c]=dist[i,j]+1;q.append((r,c))
        return str(len(dist))
    if pid==3868:
        out=[]
        for m,n in zip(v()[1::2],v()[2::2]):
            a=[1]+[0]*m
            for k in range(1,n+1):
                for total in range(k,m+1):a[total]+=a[total-k]
            out.append(str(a[m]))
        return '\n'.join(out)
    if pid==3869:return str(fib(int(t[0])+1)[0])
    if pid==3870:
        m,n=v();return str(math.comb(m+n-2,m-1))
    if pid==3871:
        n,k,*a=v();mask=1;full=(1<<k)-1
        for x in a:
            x%=k;left=((mask<<x)|(mask>>(k-x)))&full;right=((mask>>x)|(mask<<(k-x)))&full;mask=left|right
        return 'YES' if mask&1 else 'NO'
    if pid==3872:
        n=int(t[0]);a,b=1,3
        for _ in range(n):a,b=b,2*b+a
        return str(a)
    if pid==3873:
        m,n,*gaps=v();return school_cost(m,n,gaps)
    raise KeyError(pid)
