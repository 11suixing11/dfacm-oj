"""Independent exact arithmetic, graph, combinatorial, and search oracles."""
from bisect import bisect_left
from collections import Counter, deque
from decimal import Decimal, localcontext
from fractions import Fraction
from functools import lru_cache
from itertools import combinations, permutations
import math

def cubic(tokens):
    a,b,c,d=map(float,tokens)
    assert a!=0, 'nonzero cubic coefficient'
    disc=b*b-3*a*c
    assert disc>0, 'two critical points required for three different real roots'
    critical=sorted([(-b-math.sqrt(disc))/(3*a),(-b+math.sqrt(disc))/(3*a)])
    bound=1+max(abs(b/a),abs(c/a),abs(d/a))
    f=lambda x:((a*x+b)*x+c)*x+d
    roots=[]
    cuts=[-bound]+critical+[bound]
    for l,r in zip(cuts,cuts[1:]):
        assert f(l)*f(r)<0, 'three distinct real roots required'
        fl=f(l)
        for _ in range(120):
            m=(l+r)/2;fm=f(m)
            if fm==0:l=r=m;break
            if fm*fl>0:l=m
            else:r=m
        roots.append((l+r)/2)
    return roots

@lru_cache(None)
def queens():
    return tuple(''.join(str(i+1) for i in p) for p in permutations(range(8)) if len({i-p[i] for i in range(8)})==8 and len({i+p[i] for i in range(8)})==8)

@lru_cache(None)
def factor_count(n,start=2):
    return 1+sum(factor_count(n//d,d) for d in range(start,math.isqrt(n)+1) if n%d==0)

def fib(n):
    a,b=0,1
    for _ in range(n):a,b=b,a+b
    return a

def pell(n):
    def mul(a,b):return tuple(sum(a[i*2+k]*b[k*2+j] for k in range(2))%32767 for i in range(2) for j in range(2))
    p=(2,1,1,0);r=(1,0,0,1)
    while n:
        if n&1:r=mul(r,p)
        p=mul(p,p);n//=2
    return r[1]

def power_repr(n):
    return '+'.join('2(0)' if e==0 else '2' if e==1 else '2('+power_repr(e)+')' for e in range(n.bit_length()-1,-1,-1) if n&(1<<e))

@lru_cache(None)
def knight(n,m,x,y):
    if n*m%2 and (x+y)%2:return 0
    graph=[[] for _ in range(n*m)]
    for a in range(n):
        for b in range(m):
            graph[a*m+b]=[c*m+d for c,d in [(a+dx,b+dy) for dx,dy in [(1,2),(2,1),(-1,2),(-2,1),(1,-2),(2,-1),(-1,-2),(-2,-1)]] if 0<=c<n and 0<=d<m]
    full=(1<<(n*m))-1
    def visit(u,mask):
        if mask==full:return 1
        return sum(visit(v,mask|(1<<v)) for v in graph[u] if not mask&(1<<v))
    return visit(x*m+y,1<<(x*m+y))

def reachable(grid,start):
    r=len(grid);c=len(grid[0]);seen=set()
    if grid[start[0]][start[1]]=='#':return seen
    seen.add(start);q=deque([start])
    while q:
        i,j=q.popleft()
        for a,b in [(i+1,j),(i-1,j),(i,j+1),(i,j-1)]:
            if 0<=a<r and 0<=b<c and grid[a][b]!='#' and (a,b) not in seen:seen.add((a,b));q.append((a,b))
    return seen

def letters(grid):
    r,c=len(grid),len(grid[0]);value=[ord(ch)-65 for row in grid for ch in row];graph=[]
    for i in range(r):
        for j in range(c):graph.append([a*c+b for a,b in [(i+1,j),(i-1,j),(i,j+1),(i,j-1)] if 0<=a<r and 0<=b<c])
    maximum=len(set(value));best=1
    def visit(u,mask,count):
        nonlocal best
        best=max(best,count)
        if best==maximum:return
        for v in graph[u]:
            bit=1<<value[v]
            if not mask&bit:visit(v,mask|bit,count+1)
            if best==maximum:return
    visit(0,1<<value[0],1);return best

def chess(grid,k):
    n=len(grid);states={0:1}
    for row in grid:
        new=dict(states)
        for mask,count in states.items():
            if mask.bit_count()>=k:continue
            for j,ch in enumerate(row):
                if ch=='#' and not mask&(1<<j):new[mask|(1<<j)]=new.get(mask|(1<<j),0)+count
        states=new
    return sum(v for mask,v in states.items() if mask.bit_count()==k)

def dragon(words,first):
    n=len(words);edges=[[] for _ in words]
    for i,u in enumerate(words):
        for j,v in enumerate(words):
            overlap=next((k for k in range(1,min(len(u),len(v))) if u[-k:]==v[:k]),0)
            if overlap:edges[i].append((j,len(v)-overlap))
    powers=[3**i for i in range(n)]
    @lru_cache(None)
    def dfs(u,counts):
        return max([0]+[gain+dfs(v,counts+powers[v]) for v,gain in edges[u] if counts//powers[v]%3<2])
    return max(len(w)+dfs(i,powers[i]) for i,w in enumerate(words) if w[0]==first)

def coprime_groups(a):
    n=len(a);good=[False]*(1<<n);good[0]=True
    for mask in range(1,1<<n):
        bit=mask&-mask;i=bit.bit_length()-1;rest=mask-bit
        good[mask]=good[rest] and all(math.gcd(a[i],a[j])==1 for j in range(n) if rest&(1<<j))
    dp=[0]+[n]*(len(good)-1)
    for mask in range(1,len(good)):
        if good[mask]:dp[mask]=1;continue
        bit=mask&-mask;sub=mask
        while sub:
            if sub&bit and good[sub]:dp[mask]=min(dp[mask],1+dp[mask^sub])
            sub=(sub-1)&mask
    return dp[-1]

def max_matrix(n,a):
    grid=[a[i*n:(i+1)*n] for i in range(n)];best=max(a)
    for left in range(n):
        sums=[0]*n
        for right in range(left,n):
            minimum=prefix=0
            for row in range(n):
                sums[row]+=grid[row][right];prefix+=sums[row];best=max(best,prefix-minimum);minimum=min(minimum,prefix)
    return best

def boxes(a):
    a=list(a);answer=a[5]+a[4]+a[3]+(a[2]+3)//4
    a[0]=max(0,a[0]-11*a[4]);slots=5*a[3]
    used=min(a[1],slots);a[1]-=used;a[0]=max(0,a[0]-4*(slots-used))
    rem=a[2]%4
    if rem:
        slots={1:5,2:3,3:1}[rem];used=min(a[1],slots);a[1]-=used;a[0]=max(0,a[0]-(36-9*rem-4*used))
    answer+=(a[1]+8)//9
    if a[1]%9:a[0]=max(0,a[0]-(36-4*(a[1]%9)))
    return answer+(a[0]+35)//36

def crossing(a):
    a=sorted(a);n=len(a);dp=[0]*(n+1)
    if n:dp[1]=a[0]
    if n>=2:dp[2]=a[1]
    for k in range(3,n+1):dp[k]=min(dp[k-1]+a[0]+a[k-1],dp[k-2]+a[0]+2*a[1]+a[k-1])
    return dp[n]

def inversion(a):
    def merge(a):
        if len(a)<2:return a,0
        l,n=merge(a[:len(a)//2]);r,m=merge(a[len(a)//2:]);out=[];i=j=0;count=n+m
        while i<len(l) and j<len(r):
            if l[i]<=r[j]:out.append(l[i]);i+=1
            else:out.append(r[j]);j+=1;count+=len(l)-i
        return out+l[i:]+r[j:],count
    return merge(a)[1]

def partition_cost(a,m):
    lo,hi=max(a),sum(a)
    while lo<hi:
        limit=(lo+hi)//2;groups=1;cost=0
        for x in a:
            if cost+x>limit:groups+=1;cost=0
            cost+=x
        if groups<=m:hi=limit
        else:lo=limit+1
    return lo

def expansion(tokens):
    L,n,C=map(float,tokens);delta=n*C
    if L==0 or delta==0:return 0.0
    # Invert the chord/arc equation using theta, then compute sagitta.
    lo,hi=0.0,math.pi/2
    for _ in range(100):
        theta=(lo+hi)/2
        excess=theta*theta/6+7*theta**4/360+31*theta**6/15120 if theta<.001 else theta/math.sin(theta)-1
        if excess<delta:lo=theta
        else:hi=theta
    return L*math.tan((lo+hi)/4)/2

def solve(pid,text):
    t=text.split();v=lambda:list(map(int,t))
    if pid==3874:
        stack=[]
        with localcontext() as ctx:
            ctx.prec=80
            for s in reversed(t):
                if s in ['+','-','*','/']:
                    a=stack.pop();b=stack.pop();stack.append(a+b if s=='+' else a-b if s=='-' else a*b if s=='*' else a/b)
                else:stack.append(Decimal(s))
            assert len(stack)==1;return f'{stack[0]:.6f}'
    if pid==3875:return '\n'.join(''.join(p) for p in permutations(t[0]))
    if pid==3876:return '\n'.join(str(factor_count(x)) for x in v()[1:])
    if pid==3877:return '\n'.join(str(fib(x)) for x in v()[1:])
    if pid==3878:return '\n'.join(str(pell(x)) for x in v()[1:])
    if pid==3879:
        out=[]
        for s in text.splitlines():
            stack=[];marks=[' ']*len(s)
            for i,ch in enumerate(s):
                if ch=='(':stack.append(i)
                elif ch==')':
                    if stack:stack.pop()
                    else:marks[i]='?'
            for i in stack:marks[i]='$'
            out.extend([s,''.join(marks)])
        return '\n'.join(out)
    if pid==3880:return '\n'.join(str(fib(x+1)) for x in v())
    if pid==3881:
        n=int(t[0]);a,b,c=t[1:];out=[]
        # Explicit call frames independently model recursive disk moves.
        work=[(n,a,b,c,False)]
        while work:
            n,a,b,c,moving=work.pop()
            if moving:out.append(f'{a}->{n}->{b}')
            elif n:
                work.extend([(n-1,c,b,a,False),(n,a,b,c,True),(n-1,a,c,b,False)])
        return '\n'.join(out)
    if pid==3882:
        out=[]
        for m,n in zip(v()[1::2],v()[2::2]):
            a=[1]+[0]*m
            for part in range(1,n+1):
                for total in range(part,m+1):a[total]+=a[total-part]
            out.append(str(a[m]))
        return '\n'.join(out)
    if pid==3883:return str(math.gcd(*v()))
    if pid==3884:return power_repr(int(t[0]))
    if pid==3885:return str(sum((Fraction(s) for s in t[1:]),Fraction()))
    if pid==3886:
        n=int(t[0]);out=[]
        for d in range(2,n+1):
            count=0
            while n%d==0:count+=1;n//=d
            if count:out.append(str(d)+(f'^{count}' if count>1 else ''))
        return '*'.join(out)
    if pid==3887:
        k,x=map(int,text.split(','));seen={k};q=deque([k])
        while q:
            a=q.popleft()
            for b in [2*a+1,3*a+1]:
                if b<=x and b not in seen:seen.add(b);q.append(b)
        return 'YES' if x in seen else 'NO'
    if pid==3888:return str(letters(t[2:]))
    if pid==3889:return '\n'.join(line for i,q in enumerate(queens(),1) for line in [f'No. {i}']+[' '.join('1' if int(q[c])==r+1 else '0' for c in range(8)) for r in range(8)])
    if pid==3890:return '\n'.join(queens()[x-1] for x in v()[1:])
    if pid in [3891,3892,3893]:
        i=1 if pid==3891 else 0;out=[]
        while i<len(t):
            if pid==3891:n=int(t[i]);i+=1
            else:
                a,b=map(int,t[i:i+2]);i+=2
                if a==b==(0 if pid==3892 else -1):break
                n=b if pid==3892 else a
            grid=t[i:i+n];i+=n
            if pid==3891:
                x,y,u,w=map(int,t[i:i+4]);i+=4;out.append('YES' if (u,w) in reachable(grid,(x,y)) else 'NO')
            elif pid==3892:
                s=next((r,c) for r,row in enumerate(grid) for c,ch in enumerate(row) if ch=='@');out.append(str(len(reachable(grid,s))))
            else:out.append(str(chess(grid,b)))
        return '\n'.join(out)
    if pid==3894:
        def win(a,b):
            a,b=sorted((a,b));return b%a==0 or b//a>=2 or not win(b%a,a)
        return '\n'.join('win' if win(a,b) else 'lose' for a,b in zip(v()[::2],v()[1::2]) if a and b)
    if pid==3895:return '\n'.join(str(knight(*v()[i:i+4])) for i in range(1,len(t),4))
    if pid==3896:return str(dragon(t[1:-1],t[-1]))
    if pid==3897:return str(coprime_groups(v()[1:]))
    if pid==3898:
        out=[]
        for n in v()[:-1]:
            bit=n&-n;r=n+bit;out.append(str(r|(((n^r)>>2)//bit)))
        return '\n'.join(out)
    if pid==3899:return str(max_matrix(int(t[0]),v()[1:]))
    if pid==3900:
        out=[];i=1
        for _ in range(int(t[0])):
            w,s=map(int,t[i:i+2]);i+=2;a=[(int(t[j]),int(t[j+1])) for j in range(i,i+2*s,2)];i+=2*s;total=Fraction()
            for mass,value in sorted(a,key=lambda p:Fraction(p[1],p[0]),reverse=True):take=min(w,mass);total+=Fraction(take*value,mass);w-=take
            with localcontext() as ctx:ctx.prec=60;out.append(f'{Decimal(total.numerator)/Decimal(total.denominator):.2f}')
        return '\n'.join(out)
    if pid==3901:return '\n'.join(str(boxes(v()[i:i+6])) for i in range(0,len(t)-6,6))
    if pid==3902:
        out=[];i=0
        while int(t[i]):
            n=int(t[i]);i+=1;times=[Fraction(16200)/Fraction(speed)+int(start) for speed,start in zip(t[i:i+2*n:2],t[i+1:i+2*n:2]) if int(start)>=0];i+=2*n;out.append(str(math.ceil(min(times))))
        return '\n'.join(out)
    if pid==3903:
        n,b,*a=v();total=0
        for k,x in enumerate(sorted(a,reverse=True),1):
            total+=x
            if total>=b:return str(k)
    if pid==3904:
        out=[];i=0;a=v()
        while i<len(a):
            n=a[i];s=sum(a[i+1:i+n+1]);m=max(a[i+1:i+n+1]);i+=n+1;twice=min(s,2*(s-m));out.append(f'{twice//2}.{5 if twice%2 else 0}')
        return '\n'.join(out)
    if pid==3905:
        a=list(zip(v()[1::2],v()[2::2]));return ','.join(f'({x},{y})' for x,y in sorted(a) if not any((u,w)!=(x,y) and u>=x and w>=y for u,w in a))
    if pid==3906:return '\n'.join(min(''.join(s) for s in combinations(x,len(x)-int(k))) for x,k in zip(t[1::2],t[2::2]))
    if pid==3907:
        out=[];a=v();i=1
        for _ in range(a[0]):n=a[i];i+=1;out.append(str(crossing(a[i:i+n])));i+=n
        return '\n'.join(out)
    if pid==3908:
        n,m,*a=v();q=[0]*min(m,n)
        for x in a:j=min(range(len(q)),key=q.__getitem__);q[j]+=x
        return str(max(q))
    if pid==3909:return '\n'.join(str(pow(2011,n,10000)) for n in v()[1:])
    if pid==3910:return '\n'.join(map(str,sorted(v()[1:-1],reverse=True)[:int(t[-1])]))
    if pid==3911:
        a=sorted(zip(v()[1::2],v()[2::2]));l,r=a[0]
        for x,y in a[1:]:
            if x>r:return 'no'
            r=max(r,y)
        return f'{l} {r}'
    if pid==3912:return str(inversion(v()[1:]))
    if pid==3913:return ' '.join(f'{0 if abs(x)<1e-10 else x:.2f}' for x in cubic(t))
    if pid==3914:return '\n'.join(f'{x} {n}' for x,n in sorted(Counter(v()[1:]).items()))
    if pid==3915:
        a=v();n=a[0];values=a[1:n+1];out=[]
        for x in a[n+2:]:j=bisect_left(values,x);near=values[max(0,j-1):min(n,j+1)];out.append(str(min(near,key=lambda y:(abs(y-x),y))))
        return '\n'.join(out)
    if pid==3916:
        with localcontext() as ctx:
            ctx.prec=70;lo,hi=Decimal('1.5'),Decimal('2.4')
            for _ in range(240):
                x=(lo+hi)/2;f=((((x-15)*x+85)*x-225)*x+274)*x-121
                if f>0:lo=x
                else:hi=x
            return f'{(lo+hi)/2:.6f}'
    if pid==3917:
        n,k=map(int,t[:2]);a=[int(Decimal(s)*100) for s in t[2:]];lo,hi=0,max(a)
        while lo<hi:
            mid=(lo+hi+1)//2
            if sum(x//mid for x in a)>=k:lo=mid
            else:hi=mid-1
        return f'{lo//100}.{lo%100:02}'
    if pid==3918:return str(partition_cost(v()[2:],int(t[1])))
    if pid==3919:
        counts=Counter(v()[1:-1]);m=int(t[-1])
        for x in sorted(counts):
            y=m-x
            if y in counts and (x!=y or counts[x]>1) and x<=y:return f'{x} {y}'
        return 'No'
    if pid==3920:return ' '.join(map(str,sorted(set(v()[1:]))))
    if pid==3921:return f'{expansion(t):.3f}'
    if pid==3922:
        L,n,m,*a=v();lo,hi=1,L
        def needed(gap):
            count=0;last=0
            for x in a+[L]:
                if x-last<gap:count+=1
                else:last=x
            return count
        while lo<hi:
            mid=(lo+hi+1)//2
            if needed(mid)<=m:lo=mid
            else:hi=mid-1
        return str(lo)
    raise KeyError(pid)
