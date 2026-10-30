"""Independent chapter oracles used to verify original and repaired Lanqiao data."""
from bisect import insort
from collections import Counter, deque
from decimal import Decimal, localcontext, ROUND_HALF_UP
from itertools import permutations


def chinese(n, initial=True):
    words='ling yi er san si wu liu qi ba jiu'.split()
    for value,unit in [(10**8,'yi'),(10**4,'wan'),(1000,'qian'),(100,'bai'),(10,'shi')]:
        if n>=value:
            q,r=divmod(n,value)
            out=['shi'] if value==10 and q==1 and initial else chinese(q,initial)+[unit]
            if r:
                if value>=100 and r<value//10:out.append('ling')
                out.extend(chinese(r,False))
            return out
    return [words[n]]


def palindrome_cost(s):
    if sum(v%2 for v in Counter(s).values())>1:return 'Impossible'
    positions={c:deque() for c in set(s)}
    for i,c in enumerate(s):positions[c].append(i)
    target=[-1]*len(s)
    left,right=0,len(s)-1
    for i,c in enumerate(s):
        if target[i]>=0:continue
        assert positions[c].popleft()==i
        if not positions[c]:target[i]=len(s)//2;continue
        j=positions[c].pop()
        target[i],target[j]=left,right
        left+=1;right-=1
    bit=[0]*(len(s)+1)
    answer=0
    for seen,x in enumerate(target):
        p=x+1;prefix=0
        while p:prefix+=bit[p];p-=p&-p
        answer+=seen-prefix
        p=x+1
        while p<len(bit):bit[p]+=1;p+=p&-p
    return str(answer)


def race(v1,v2,threshold,rest,length):
    # Advance whole running/resting intervals, independently of a per-second loop.
    time=rabbit=0
    turtle_end=length//v2
    while time<turtle_end and rabbit<length:
        if v1>v2:
            deficit=threshold-(rabbit-time*v2)
            until_rest=max(1,(deficit+v1-v2-1)//(v1-v2))
        else:until_rest=10**9
        until_finish=(length-rabbit+v1-1)//v1
        run=min(until_rest,until_finish,turtle_end-time)
        time+=run;rabbit+=run*v1
        if rabbit>=length or time==turtle_end:break
        time+=min(rest,turtle_end-time)
    return ('D' if rabbit>=length and time==turtle_end else 'R' if rabbit>=length else 'T')+'\n'+str(time)


def solve(pid,text):
    t=text.split()
    if pid==4072:
        n=int(t[0]);board=list(map(int,t[1:]));good=[]
        for p in permutations(range(n)):
            if all(board[i*n+p[i]] for i in range(n)) and len({i+p[i] for i in range(n)})==n and len({i-p[i] for i in range(n)})==n:good.append(p)
        return str(sum(all(a!=b for a,b in zip(p,q)) for p in good for q in good))
    if pid==4073:
        n=int(t[0])
        # Position k contains the letter corresponding to the lowest set bit of k.
        small=min(n,16)
        block=''.join(chr(64+(k&-k).bit_length()) for k in range(1,1<<small))
        for level in range(small+1,n+1):block=block+chr(64+level)+block
        return block
    if pid==4074:
        numbers=sorted(map(int,t[1:]));cost=0
        while len(numbers)>1:
            a=numbers.pop(0)+numbers.pop(0);cost+=a;insort(numbers,a)
        return str(cost)
    if pid==4075:
        a,b=map(int,t);spf=list(range(b+1))
        for p in range(2,int(b**0.5)+1):
            if spf[p]==p:
                for k in range(p*p,b+1,p):
                    if spf[k]==k:spf[k]=p
        out=[]
        for k in range(a,b+1):
            x=k;f=[]
            while x>1:f.append(str(spf[x]));x//=spf[x]
            out.append(str(k)+'='+'*'.join(f))
        return '\n'.join(out)
    if pid==4076:
        m,n=map(int,t[:2]);a=t[2:];out=[];top=left=0;bottom=m-1;right=n-1
        while top<=bottom and left<=right:
            for i in range(top,bottom+1):out.append(a[i*n+left])
            left+=1
            if left>right:break
            for j in range(left,right+1):out.append(a[bottom*n+j])
            bottom-=1
            if top>bottom:break
            for i in range(bottom,top-1,-1):out.append(a[i*n+right])
            right-=1
            if left>right:break
            for j in range(right,left-1,-1):out.append(a[top*n+j])
            top+=1
        return ' '.join(out)
    if pid==4077:
        a,b=t;return str(1 if len(a)!=len(b) else 2 if a==b else 3 if a.lower()==b.lower() else 4)
    if pid==4078:return palindrome_cost(t[1])
    if pid==4079:
        small='zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
        def english(x):return small[x] if x<20 else ['','','twenty','thirty','forty','fifty'][x//10]+(' '+small[x%10] if x%10 else '')
        h,m=map(int,t);return english(h)+(" o'clock" if not m else ' '+english(m))
    if pid==4080:return ' '.join(chinese(int(''.join(t))))
    if pid==4081:
        n=int(t[0]);return f'{n//3600}:{n//60%60}:{n%60}'
    if pid==4082:
        with localcontext() as context:
            context.prec=80
            a=list(map(Decimal,t));x=sorted([a[0],a[2]]);y=sorted([a[1],a[3]]);xx=sorted([a[4],a[6]]);yy=sorted([a[5],a[7]])
            area=max(Decimal(0),min(x[1],xx[1])-max(x[0],xx[0]))*max(Decimal(0),min(y[1],yy[1])-max(y[0],yy[0]))
            return str(area.quantize(Decimal('.01'),rounding=ROUND_HALF_UP))
    if pid==4083:
        n,m=map(int,t[:2]);a=[list(map(int,t[2+i*n:2+(i+1)*n])) for i in range(n)]
        def mul(x,y):return [[sum(x[i][k]*y[k][j] for k in range(n)) for j in range(n)] for i in range(n)]
        r=[[int(i==j) for j in range(n)] for i in range(n)]
        while m:
            if m&1:r=mul(r,a)
            m//=2
            if m:a=mul(a,a)
        return '\n'.join(' '.join(map(str,row)) for row in r)
    if pid==4084:
        n=int(t[0]);a=[tuple(map(int,t[1+i*n:1+(i+1)*n])) for i in range(n)]
        truth,count=Counter(a).most_common(1)[0]
        assert count>n//2 and sum(truth)>n//2
        assert all(a[i]==truth for i,x in enumerate(truth) if x)
        return ' '.join(str(i+1) for i,x in enumerate(truth) if x)
    if pid==4085:return str(int(t[0])+int(t[1]))
    if pid==4086:return race(*map(int,t))
    raise KeyError(pid)
