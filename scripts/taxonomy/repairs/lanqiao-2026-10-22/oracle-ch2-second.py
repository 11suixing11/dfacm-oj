"""Independent input validation and answers for training orders 24–34."""
from collections import Counter, deque
from decimal import Decimal, localcontext
from itertools import combinations, permutations
from math import gcd, isqrt
import re

def car_input(text):
    tokens=list(map(int,text.split()));assert len(tokens)>=4
    cities,flight,start,end=tokens[:4]
    assert 1<=cities<=100 and flight>0 and 1<=start<=cities and 1<=end<=cities and len(tokens)==4+7*cities
    airports=[];prices=[]
    for i in range(cities):
        row=tokens[4+7*i:11+7*i];assert all(v>0 for v in row)
        points=list(zip(row[:6:2],row[1:6:2]));assert len(set(points))==3
        # The endpoints of the unique longest side are opposite corners.
        opposite=max(combinations(range(3),2),key=lambda p:sum((points[p[0]][j]-points[p[1]][j])**2 for j in [0,1]))
        right=next(k for k in range(3) if k not in opposite)
        assert sum((points[opposite[0]][j]-points[right][j])*(points[opposite[1]][j]-points[right][j]) for j in [0,1])==0,'not a rectangle'
        points.append(tuple(points[opposite[0]][j]+points[opposite[1]][j]-points[right][j] for j in [0,1]))
        airports.extend(points);prices.append(row[-1])
    return flight,start,end,airports,prices

def car(text):
    import numpy as np
    flight,start,end,airports,prices=car_input(text)
    xy=np.array(airports,dtype=np.float64)
    length=np.sqrt(np.sum((xy[:,None,:]-xy[None,:,:])**2,axis=2))
    city=np.arange(len(airports))//4
    weights=np.where(city[:,None]==city[None,:],np.array(prices)[city][:,None],flight)*length
    for k in range(len(airports)):weights=np.minimum(weights,weights[:,k,None]+weights[None,k,:])
    return f'{np.min(weights[4*(start-1):4*start,4*(end-1):4*end]):.1f}'

def fbi(text):
    tokens=text.split();assert len(tokens)==2
    n=int(tokens[0]);bits=tokens[1];assert 0<=n<=10 and len(bits)==1<<n and set(bits)<={'0','1'}
    layers=[['B' if c=='0' else 'I' for c in bits]]
    for _ in range(n):
        last=layers[-1];layers.append([a if a==b else 'F' for a,b in zip(last[::2],last[1::2])])
    answer=[];stack=[(n,0,False)]
    while stack:
        level,index,visited=stack.pop()
        if not level or visited:answer.append(layers[level][index]);continue
        stack.extend([(level,index,True),(level-1,2*index+1,False),(level-1,2*index,False)])
    return ''.join(answer)

def hanoi_input(text,allow_old=False):
    tokens=list(map(int,text.split()));assert len(tokens)==2
    n,m=tokens;assert 0<=n<=(9 if allow_old else 8) and ((n==0 and m==0) or 1<=m<=n)
    return n,m

def hanoi(text):
    n,m=hanoi_input(text)
    # Recurrence from moving an at-most-m largest block after clearing smaller disks.
    dp=[0]*(n+1)
    for disks in range(1,n+1):dp[disks]=min(2*dp[disks-block]+1 for block in range(1,min(disks,m)+1))
    return str(dp[n])

def hanoi_bfs(n,m):
    if not n:return 0
    target=(2,)*n;initial=(0,)*n;queue=deque([(initial,0)]);seen={initial}
    while queue:
        state,depth=queue.popleft()
        pegs=[[i for i,p in enumerate(state) if p==j] for j in range(3)]
        for source in range(3):
            for count in range(1,min(m,len(pegs[source]))+1):
                block=pegs[source][:count]
                for dest in range(3):
                    if dest==source or (pegs[dest] and pegs[dest][0]<block[-1]):continue
                    moved=list(state)
                    for disk in block:moved[disk]=dest
                    moved=tuple(moved)
                    if moved==target:return depth+1
                    if moved not in seen:seen.add(moved);queue.append((moved,depth+1))
    raise AssertionError('unreachable')

def jam_input(text):
    tokens=text.split();assert len(tokens)==4
    s,t,w=map(int,tokens[:3]);cur=tokens[3]
    assert 1<=s<t<=26 and 2<=w<=t-s and len(cur)==w and all(s<=ord(c)-96<=t for c in cur) and list(cur)==sorted(set(cur))
    return s,t,w,cur

def jam_rank(values,s,t):
    from math import comb
    rank=0;last=s-1;w=len(values)
    for i,value in enumerate(values):
        for skipped in range(last+1,value):rank+=comb(t-skipped,w-i-1)
        last=value
    return rank

def jam_unrank(rank,s,t,w):
    from math import comb
    answer=[];last=s-1
    for i in range(w):
        for value in range(last+1,t+1):
            count=comb(t-value,w-i-1)
            if rank<count:answer.append(value);last=value;break
            rank-=count
        else:raise AssertionError('invalid rank')
    return ''.join(chr(96+v) for v in answer)

def jam(text):
    from math import comb
    s,t,w,cur=jam_input(text);rank=jam_rank([ord(c)-96 for c in cur],s,t)
    return '\n'.join(jam_unrank(r,s,t,w) for r in range(rank+1,min(rank+6,comb(t-s+1,w))))

def hankson_input(text):
    tokens=list(map(int,text.split()));n=tokens[0]
    assert 1<=n<=2000 and len(tokens)==1+4*n
    rows=[tokens[1+4*i:5+4*i] for i in range(n)]
    assert all(all(1<=v<=2000000000 for v in row) and row[0]%row[1]==0 and row[3]%row[2]==0 for row in rows)
    return rows

def primes(limit=44722):
    sieve=bytearray(b'\1')*(limit+1);sieve[:2]=b'\0\0'
    for p in range(2,isqrt(limit)+1):
        if sieve[p]:sieve[p*p::p]=b'\0'*len(sieve[p*p::p])
    return [p for p in range(2,limit+1) if sieve[p]]
_primes=primes()
def factors(n):
    result={}
    for p in _primes:
        if p*p>n:break
        exponent=0
        while n%p==0:n//=p;exponent+=1
        if exponent:result[p]=exponent
    if n>1:result[n]=1
    return result

def hankson_count(a0,a1,b0,b1):
    # Every x divides b1. Count permitted valuations for each prime of b1.
    if b1%a1:return 0
    answer=1
    for p,upper in factors(b1).items():
        exponents=[]
        for number in [a0,a1,b0]:
            exponent=0
            while number%p==0:number//=p;exponent+=1
            exponents.append(exponent)
        a,b,c=exponents
        possible=sum(min(e,a)==b and max(e,c)==upper for e in range(upper+1))
        answer*=possible
    return answer

def hankson(text):return '\n'.join(str(hankson_count(*row)) for row in hankson_input(text))

def product(text):
    tokens=text.split();assert len(tokens)==3
    n,k=map(int,tokens[:2]);digits=tokens[2]
    assert 1<=n<=40 and 1<=k<=min(6,n-1) and len(digits)==n and re.fullmatch('[0-9]+',digits)
    dp=[[None]*(k+2) for _ in range(n+1)];dp[0][0]=1
    for end in range(1,n+1):
        for parts in range(1,min(k+1,end)+1):
            dp[end][parts]=max((dp[start][parts-1]*int(digits[start:end]) for start in range(parts-1,end) if dp[start][parts-1] is not None),default=None)
    return str(dp[n][k+1])

def cubic_roots(text):
    # Decimal bisection on half-unit intervals is independent of the C++
    # derivative partition and the checker's trigonometric closed form.
    tokens=text.split();assert len(tokens)==4
    with localcontext() as ctx:
        ctx.prec=100
        a,b,c,d=map(Decimal,tokens)
        assert all(v.is_finite() and abs(v)<=10 for v in [a,b,c,d]) and a!=0
        def f(x):return ((a*x+b)*x+c)*x+d
        grid=[Decimal(i)/2 for i in range(-200,201)]
        roots=[]
        for left,right in zip(grid,grid[1:]):
            fl,fr=f(left),f(right)
            if fl==0:roots.append(left)
            if fl*fr<0:
                for _ in range(220):
                    mid=(left+right)/2;fm=f(mid)
                    if fm==0:left=right=mid;break
                    if (fm<0)==(fl<0):left,fl=mid,fm
                    else:right=mid
                roots.append((left+right)/2)
        if f(grid[-1])==0:roots.append(grid[-1])
        roots.sort()
        assert len(roots)==3,('not three distinct real roots',tokens,roots)
        assert roots[0]>=-100 and roots[-1]<=100
        assert all(y-x>=Decimal(1)-Decimal('1e-60') for x,y in zip(roots,roots[1:])),('root gap < 1',tokens,roots)
        return roots

def cubic(text):
    return ' '.join(format(x if abs(x)>=Decimal('.005') else Decimal(0),'.2f') for x in cubic_roots(text))

def cubic_output(text,output,tolerance=Decimal('0.005000000001')):
    tokens=output.split();assert len(tokens)==3,('expected exactly three roots',tokens)
    assert all(re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?',t) for t in tokens)
    got=list(map(Decimal,tokens));assert all(v.is_finite() for v in got)
    assert all(x<y for x,y in zip(got,got[1:]))
    expected=cubic_roots(text)
    assert all(abs(a-b)<=tolerance for a,b in zip(got,expected)),('incorrect roots',got,expected)
    return True

def calculations_input(text):
    tokens=text.split()
    assert len(tokens)==2, 'expected initial value and expression'
    initial=int(tokens[0]);expression=tokens[1]
    assert -1000<=initial<=1000 and 1<=len(expression)<=10000
    pattern=re.compile(r'(-|\+)?(?:(\d+)\*)?(a\+\+|\+\+a)')
    terms=[];position=0
    while position<len(expression):
        match=pattern.match(expression,position)
        assert match, ('invalid expression',position)
        sign,coefficient,increment=match.groups()
        assert sign in (None,'-') if position==0 else sign in ('+','-')
        coefficient=int(coefficient) if coefficient is not None else 1
        assert 0<=coefficient<=1000
        terms.append(((-1 if sign=='-' else 1)*coefficient,increment=='++a'))
        position=match.end()
    return initial,terms

def calculations(text):
    initial,terms=calculations_input(text)
    counts=Counter(coefficient for coefficient,_ in terms)
    value=sum(coefficient*(initial+prefix) for coefficient,prefix in terms)
    position=0
    for coefficient,count in sorted(counts.items()):
        value+=coefficient*(2*position+count-1)*count//2
        position+=count
    return str(value)

def calculations_brute(text):
    initial,terms=calculations_input(text)
    return str(max(sum(terms[i][0]*(initial+step+terms[i][1]) for step,i in enumerate(order)) for order in permutations(range(len(terms)))))

def solve(pid,text):
    if pid==4242:
        tokens=text.split();assert len(tokens)==1 and re.fullmatch('[a-z]+',tokens[0])
        positions=[tokens[0].find(letter) for letter in 'aeiou']
        return str(min((p+1 for p in positions if p>=0),default=0))
    if pid==4243:
        tokens=list(map(int,text.split()));assert len(tokens)==20
        real=sum(tokens[::2]);imaginary=sum(tokens[1::2])
        assert -(1<<63)<=real<(1<<63) and -(1<<63)<=imaginary<(1<<63)
        return f'{real}{imaginary:+d}i'
    if pid==4244:
        tokens=list(map(int,text.split()));assert len(tokens)==2 and all(0<=v<=1000 for v in tokens)
        return str(sum(tokens))
    if pid==4245:return calculations(text)
    if pid==4246:return car(text)
    if pid==4247:return fbi(text)
    if pid==4248:return hankson(text)
    if pid==4249:return hanoi(text)
    if pid==4250:return jam(text)
    if pid==4251:return cubic(text)
    if pid==4252:return product(text)
    raise ValueError(pid)
