"""Independent graph and dynamic-programming oracles for chapter 6."""
from bisect import bisect_left,bisect_right
from collections import defaultdict,deque
from functools import lru_cache
from itertools import combinations

def bfs(grid,start,end,directions=None):
    directions=directions or [(1,0),(-1,0),(0,1),(0,-1)]
    r,c=len(grid),len(grid[0]);q=deque([start]);d={start:0};parent={start:None}
    while q:
        x,y=q.popleft()
        if (x,y)==end:break
        for a,b in directions:
            u,v=x+a,y+b
            if 0<=u<r and 0<=v<c and grid[u][v]!='#' and (u,v) not in d:
                d[u,v]=d[x,y]+1;parent[u,v]=x,y;q.append((u,v))
    path=[];p=end
    if end in d:
        while p is not None:path.append(p);p=parent[p]
    return d.get(end,-1),path[::-1]

def increasing(a,weak=False,sequence=False):
    tails=[];positions=[];parent=[-1]*len(a)
    for i,x in enumerate(a):
        k=(bisect_right if weak else bisect_left)(tails,x)
        if k:parent[i]=positions[k-1]
        if k==len(tails):tails.append(x);positions.append(i)
        else:tails[k]=x;positions[k]=i
    if not sequence:return len(tails)
    answer=[];p=positions[-1]
    while p>=0:answer.append(a[p]);p=parent[p]
    return answer[::-1]

def triangle(n,a):
    rows=[];i=0
    for k in range(1,n+1):rows.append(a[i:i+k]);i+=k
    values=rows.pop()
    for row in rows[::-1]:values=[x+max(values[k],values[k+1]) for k,x in enumerate(row)]
    return values[0]

def bitonic(a):
    n=len(a);left=[1]*n;right=[1]*n
    for i in range(n):
        left[i]=1+max((left[j] for j in range(i) if a[j]<a[i]),default=0)
    for i in range(n-1,-1,-1):
        right[i]=1+max((right[j] for j in range(i+1,n) if a[j]<a[i]),default=0)
    return max(x+y-1 for x,y in zip(left,right))

def lcs(a,b):
    # Bitset LCS avoids mirroring the reference's rolling DP recurrence.
    masks={}
    for i,c in enumerate(b):masks[c]=masks.get(c,0)|(1<<i)
    state=0
    for c in a:
        x=state|masks.get(c,0);state=x&~(x-((state<<1)|1))
    return state.bit_count()

def knapsack(capacity,items):
    dp=[0]*(capacity+1)
    for weight,value,count in items:
        old=dp[:]
        for total in range(capacity+1):
            dp[total]=max(old[total-k*weight]+k*value for k in range(min(count,total//weight)+1))
    return dp[-1]

def cities(n,a):
    # Floyd-Warshall, independent of the C++ Dijkstra implementation.
    big=10**60;d=[[0 if i==j else a[i][j] or big for j in range(n)] for i in range(n)]
    for k in range(n):
        for i in range(n):
            for j in range(n):d[i][j]=min(d[i][j],d[i][k]+d[k][j])
    p=[0]
    while p[-1]!=n-1:
        u=p[-1];v=next(v for v in range(n) if v!=u and a[u][v]>0 and a[u][v]+d[v][-1]==d[u][-1]);p.append(v)
    return d[0][-1],[v+1 for v in p]

def mines(n,values,edges):
    @lru_cache(None)
    def best(i):
        neighbors=sorted(edges[i])
        if not neighbors:return values[i],(i+1,)
        options=[best(j) for j in neighbors];value=max(v for v,p in options)
        path=min(p for v,p in options if v==value)
        return values[i]+value,(i+1,)+path
    options=[best(i) for i in range(n)];value=max(v for v,p in options)
    return value,min(p for v,p in options if v==value)

def allocation(n,m,a):
    @lru_cache(None)
    def best(i,remaining):
        if i==n:return 0,()
        choices=[]
        for k in range(remaining+1):
            value,path=best(i+1,remaining-k);choices.append((value+(a[i][k-1] if k else 0),(k,)+path))
        maximum=max(v for v,p in choices)
        return maximum,min(p for v,p in choices if v==maximum)
    return best(0,m)

def flowers(f,v,a):
    @lru_cache(None)
    def best(i,start):
        if i==f:return 0,()
        choices=[]
        for j in range(start,v-(f-i)+1):
            value,path=best(i+1,j+1);choices.append((a[i][j]+value,(j+1,)+path))
        maximum=max(x for x,p in choices)
        return maximum,min(p for x,p in choices if x==maximum)
    return best(0,0)

def grid_collect(n,a):
    states={(0,0):a[0][0]}
    for step in range(1,2*n-1):
        nxt={}
        for (r1,r2),value in states.items():
            for x in [r1,r1+1]:
                for y in [r2,r2+1]:
                    c1,c2=step-x,step-y
                    if 0<=x<n and 0<=y<n and 0<=c1<n and 0<=c2<n:
                        score=value+a[x][c1]+(a[y][c2] if x!=y else 0)
                        nxt[x,y]=max(nxt.get((x,y),-1),score)
        states=nxt
    return states[n-1,n-1]

def book_ranges(a,k):
    # Exact minimax DP; split reconstruction takes the earliest feasible cut.
    n=len(a);prefix=[0]
    for x in a:prefix.append(prefix[-1]+x)
    dp=[[10**60]*(k+1) for _ in range(n+1)];dp[0][0]=0
    for end in range(1,n+1):
        for people in range(1,min(k,end)+1):
            dp[end][people]=min(max(dp[cut][people-1],prefix[end]-prefix[cut]) for cut in range(people-1,end))
    limit=dp[n][k]
    # Greedily fill from the end; this minimizes preceding groups' page counts.
    end=n;parts=[]
    for remaining in range(k,0,-1):
        start=end-1;total=a[start]
        while start>=remaining and total+a[start-1]<=limit:start-=1;total+=a[start]
        parts.append((start+1,end));end=start
    assert end==0
    return parts[::-1]

def max_rectangle(n,a):
    best=-10**60
    for left in range(n):
        row=[0]*n
        for right in range(left,n):
            for i in range(n):row[i]+=a[i][right]
            prefix=0;minimum=0
            for x in row:prefix+=x;best=max(best,prefix-minimum);minimum=min(minimum,prefix)
    return best

def solve(pid,text):
    t=text.split();v=list(map(int,t)) if pid not in [3923,3924,3926,3927,3929,3931,3940,3950,3951,3972] else None
    if pid==3923:
        i=0;answer=[]
        while i<len(t):
            l,r,c=map(int,t[i:i+3]);i+=3
            if l==r==c==0:break
            grid=t[i:i+l*r];i+=l*r;start=next(j for j,s in enumerate(grid) if 'S' in s);end=next(j for j,s in enumerate(grid) if 'E' in s)
            start=(start//r,start%r,grid[start].index('S'));end=(end//r,end%r,grid[end].index('E'));q=deque([start]);d={start:0}
            while q:
                z,x,y=q.popleft()
                for a,b,c1 in [(z+1,x,y),(z-1,x,y),(z,x+1,y),(z,x-1,y),(z,x,y+1),(z,x,y-1)]:
                    if 0<=a<l and 0<=b<r and 0<=c1<c and grid[a*r+b][c1]!='#' and (a,b,c1) not in d:d[a,b,c1]=d[z,x,y]+1;q.append((a,b,c1))
            answer.append(f'Escaped in {d[end]} minute(s).' if end in d else 'Trapped!')
        return '\n'.join(answer)
    if pid==3924:
        r,c=map(int,t[:2]);grid=t[2:];seen=set();answer=0
        for i in range(r):
            for j in range(c):
                if grid[i][j]!='W' or (i,j) in seen:continue
                answer+=1;seen.add((i,j));q=[(i,j)]
                for x,y in q:
                    for a in range(x-1,x+2):
                        for b in range(y-1,y+2):
                            if 0<=a<r and 0<=b<c and grid[a][b]=='W' and (a,b) not in seen:seen.add((a,b));q.append((a,b))
        return str(answer)
    if pid==3925:
        r,c=v[:2];a=v[2:];parent=list(range(r*c));size=[1]*(r*c)
        def find(i):
            while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
            return i
        for i in range(r):
            for j in range(c):
                u=i*c+j
                for x,bit in [(u+1,4),(u+c,8)]:
                    if not a[u]&bit:
                        p,q=find(u),find(x)
                        if p!=q:parent[q]=p;size[p]+=size[q]
        roots={find(i) for i in range(r*c)};return f'{len(roots)}\n{max(size[i] for i in roots)}'
    if pid in [3926,3927,3929,3931]:
        i=1 if pid==3931 else 0;answer=[]
        while i<len(t):
            r,c=map(int,t[i:i+2]);i+=2
            if r==c==0:break
            grid=t[i:i+r];i+=r
            if pid==3927:start=(0,0);end=(r-1,c-1)
            else:
                s,e=('@','*') if pid==3926 else ('S','T') if pid==3929 else ('S','E')
                start=next((x,y) for x in range(r) for y in range(c) if grid[x][y]==s);end=next((x,y) for x in range(r) for y in range(c) if grid[x][y]==e)
            d,path=bfs(grid,start,end)
            answer.append('oop!' if pid==3931 and d<0 else str(d+(1 if pid==3927 else 0)))
        return '\n'.join(answer)
    if pid==3928:
        start,end=v
        @lru_cache(None)
        def best(target):
            if target<=start:return start-target
            if target%2==0:return min(target-start,1+best(target//2))
            if target==1:return 1
            return min(target-start,2+best((target-1)//2),2+best((target+1)//2))
        return str(best(end))
    if pid==3930:
        grid=[''.join('#' if x else '.' for x in v[i:i+5]) for i in range(0,25,5)];d,path=bfs(grid,(0,0),(4,4));return '\n'.join(f'({x}, {y})' for x,y in path)
    if pid==3932:
        answer=[]
        for i in range(1,len(v),5):
            n,x,y,a,b=v[i:i+5];grid=['.'*n]*n;distance,path=bfs(grid,(x,y),(a,b),[(1,2),(1,-2),(-1,2),(-1,-2),(2,1),(2,-1),(-2,1),(-2,-1)]);answer.append(str(distance))
        return '\n'.join(answer)
    if pid in [3933,3963]:return str(triangle(v[0],v[1:]))
    if pid==3934:
        seq=increasing(v[1:],weak=True,sequence=True);return f'max={len(seq)}\n'+' '.join(map(str,seq))
    if pid==3935:return f'{increasing([-x for x in v],weak=True)}\n{increasing(v)}'
    if pid==3936:
        n=v[0];a=[v[1+i*n:1+(i+1)*n] for i in range(n)];value,path=cities(n,a);return f'minlong={value}\n'+' '.join(map(str,path))
    if pid==3937:
        n=v[0];edges=defaultdict(set)
        for a,b in zip(v[n+1:-2:2],v[n+2:-2:2]):edges[a-1].add(b-1)
        value,path=mines(n,v[1:n+1],edges);return '-'.join(map(str,path))+'\n'+str(value)
    if pid==3938:
        pairs=sorted(zip(v[1::2],v[2::2]));return str(increasing([b for a,b in pairs]))
    if pid in [3939,3958]:return str(v[0]-bitonic(v[1:]) if pid==3939 else bitonic(v[1:]))
    if pid in [3940,3972]:
        if pid==3940:
            a,b=text.splitlines();return str(lcs(a,b))
        return '\n'.join(str(lcs(a,b)) for a,b in zip(t[::2],t[1::2]))
    if pid==3941:
        n,m=v[:2];a=[v[2+i*m:2+(i+1)*m] for i in range(n)];value,counts=allocation(n,m,a);return str(value)+'\n'+'\n'.join(f'{i+1} {k}' for i,k in enumerate(counts))
    if pid in [3942,3943,3944,3945,3965,3969]:
        if pid in [3944,3969]:n,cap=v[:2]
        else:cap,n=v[:2]
        width=3 if pid in [3944,3945] else 2;items=[]
        for i in range(2,len(v),width):
            w,value=v[i:i+2];count=v[i+2] if width==3 else cap//w if pid==3943 else 1
            if pid==3945 and count==0:count=cap//w
            items.append((w,value,count))
        value=knapsack(cap,items);return ('max=' if pid==3943 else '')+str(value)
    if pid==3946:
        ox,ni,n=v[:3];states={(0,0):0}
        for i in range(3,len(v),3):
            o,g,w=v[i:i+3];new=states.copy()
            for (x,y),value in states.items():
                key=min(ox,x+o),min(ni,y+g);new[key]=min(new.get(key,10**60),value+w)
            states=new
        return str(states[ox,ni])
    if pid==3947:
        cap,n,groups=v[:3];items=defaultdict(list)
        for i in range(3,len(v),3):w,value,g=v[i:i+3];items[g].append((w,value))
        dp=[0]*(cap+1)
        for group in items.values():
            old=dp[:]
            for total in range(cap+1):dp[total]=max([old[total]]+[old[total-w]+value for w,value in group if w<=total])
        return str(dp[-1])
    if pid in [3948,3968]:
        target=v[1] if pid==3948 else v[0];coins=v[2:] if pid==3948 else [10,20,50,100]
        dp=[1]+[0]*target
        for coin in coins:
            for j in range(coin,target+1):dp[j]+=dp[j-coin]
        return str(0 if pid==3968 and target==0 else dp[target])
    if pid==3949:
        a=v[1:];prefix=[0]
        for x in a:prefix.append(prefix[-1]+x)
        @lru_cache(None)
        def best(l,r):
            if l==r:return 0
            return prefix[r+1]-prefix[l]+min(best(l,k)+best(k+1,r) for k in range(l,r))
        return str(best(0,len(a)-1))
    if pid==3950:
        n,k=map(int,t[:2]);s=t[2];answer=0
        for cuts in combinations(range(1,n),k):
            value=1;points=(0,)+cuts+(n,)
            for l,r in zip(points,points[1:]):value*=int(s[l:r])
            answer=max(answer,value)
        return str(answer)
    if pid==3951:
        a,b=text.splitlines();dp=list(range(len(b)+1))
        for i,x in enumerate(a,1):
            new=[i]
            for j,y in enumerate(b,1):new.append(min(new[-1]+1,dp[j]+1,dp[j-1]+(x!=y)))
            dp=new
        return str(dp[-1])
    if pid==3952:
        n=v[0];a=[[0]*n for _ in range(n)]
        for i in range(1,len(v)-3,3):r,c,value=v[i:i+3];a[r-1][c-1]=value
        return str(grid_collect(n,a))
    if pid==3953:return '\n'.join(f'{a} {b}' for a,b in book_ranges(v[2:],v[1]))
    if pid==3954:
        f,cols=v[:2];a=[v[2+i*cols:2+(i+1)*cols] for i in range(f)];value,path=flowers(f,cols,a);return str(value)+'\n'+' '.join(map(str,path))
    if pid==3955:
        r,c=v[:2];a=v[2:];dp=[1]*len(a)
        for u in sorted(range(len(a)),key=a.__getitem__):
            x,y=divmod(u,c)
            for i,j in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if 0<=i<r and 0<=j<c and a[i*c+j]<a[u]:dp[u]=max(dp[u],dp[i*c+j]+1)
        return str(max(dp))
    if pid==3956:return str(increasing(v[1:]))
    if pid==3957:
        n=v[0];return str(max_rectangle(n,[v[1+i*n:1+(i+1)*n] for i in range(n)]))
    if pid in [3959,3962]:
        i=1;answer=[]
        for _ in range(v[0] if pid==3959 else 1):
            if pid==3959:r,c=v[i:i+2];i+=2
            else:r=c=v[0]
            a=v[i:i+r*c];i+=r*c;dp=[(10**60 if pid==3962 else -10**60)]*(c+1);dp[1]=0
            for row in range(r):
                for col in range(c):dp[col+1]=a[row*c+col]+(min(dp[col],dp[col+1]) if pid==3962 else max(dp[col],dp[col+1]))
            answer.append(str(dp[-1]))
        return '\n'.join(answer)
    if pid==3960:
        a=v[1:]
        # Empty subsequences are disallowed; negative predecessors can be skipped.
        dp=[]
        for i,x in enumerate(a):dp.append(x+max(0,max((dp[j] for j in range(i) if a[j]<x),default=0)))
        return str(max(dp))
    if pid==3961:
        i=1;answer=[]
        for _ in range(v[0]):
            n=v[i];i+=1;a=v[i:i+n];i+=n;answer.append(str(max(increasing(a),increasing([-x for x in a]))))
        return '\n'.join(answer)
    if pid==3964:return str(increasing([-x for x in v[1:]],weak=True))
    if pid==3966:
        n,target=v[:2];sums={0:1}
        for x in v[2:]:
            new=sums.copy()
            for total,count in sums.items():
                if total+x<=target:new[total+x]=new.get(total+x,0)+count
            sums=new
        return str(sums.get(target,0))
    if pid==3967:
        balls,hp,n=v[:3];states={(0,0):0}
        for i in range(3,len(v),2):
            b,damage=v[i:i+2];new=states.copy()
            for (x,y),count in states.items():
                if x+b<=balls and y+damage<hp:new[x+b,y+damage]=max(new.get((x+b,y+damage),0),count+1)
            states=new
        count=max(states.values());damage=min(y for (x,y),value in states.items() if value==count);return f'{count} {hp-damage}'
    if pid==3970:
        cap=v[0];bits=1;mask=(1<<(cap+1))-1
        for x in v[2:]:bits=(bits|(bits<<x))&mask
        return str(cap-(bits.bit_length()-1))
    if pid==3971:
        i=1;answer=[]
        for _ in range(v[0]):
            n,k=v[i:i+2];i+=2;a=v[i:i+n];p=v[i+n:i+2*n];i+=2*n;dp=[0]
            for j in range(n):previous=bisect_left(a,a[j]-k,0,j);dp.append(max(dp[-1],dp[previous]+p[j]))
            answer.append(str(dp[-1]))
        return '\n'.join(answer)
    raise KeyError(pid)

def equivalent(pid,text,output):
    """Validate all legal optimal witnesses, instead of comparing one chosen path."""
    try:
        if pid not in [3934,3936,3937,3941,3954]:return solve(pid,text).split()==output.split()
        v=list(map(int,text.split()));t=output.split()
        if pid==3934:
            if not t or not t[0].startswith('max='):return False
            n=v[0];k=int(t[0][4:]);a=list(map(int,t[1:]));ptr=0
            if str(k)!=t[0][4:] or k!=increasing(v[1:],weak=True) or len(a)!=k or a!=sorted(a):return False
            for x in a:
                while ptr<n and v[ptr+1]!=x:ptr+=1
                if ptr==n:return False
                ptr+=1
            return True
        if pid==3936:
            n=v[0];a=[v[1+i*n:1+(i+1)*n] for i in range(n)];opt,_=cities(n,a)
            if not t or t[0]!=f'minlong={opt}':return False
            p=list(map(int,t[1:]));return p and p[0]==1 and p[-1]==n and len(p)==len(set(p)) and all(1<=i<=n for i in p) and all(a[u-1][w-1]>0 for u,w in zip(p,p[1:])) and sum(a[u-1][w-1] for u,w in zip(p,p[1:]))==opt
        if pid==3937:
            n=v[0];edges=defaultdict(set)
            for x,y in zip(v[n+1:-2:2],v[n+2:-2:2]):edges[x-1].add(y-1)
            opt,_=mines(n,v[1:n+1],edges)
            if len(t)!=2 or int(t[1])!=opt:return False
            p=list(map(int,t[0].split('-')))
            return p and all(1<=x<=n for x in p) and all(y-1 in edges[x-1] for x,y in zip(p,p[1:])) and not edges[p[-1]-1] and sum(v[x] for x in p)==opt
        if pid==3941:
            n,m=v[:2];a=[v[2+i*m:2+(i+1)*m] for i in range(n)];opt,_=allocation(n,m,a)
            if len(t)!=1+2*n or int(t[0])!=opt:return False
            companies=list(map(int,t[1::2]));counts=list(map(int,t[2::2]));return set(companies)==set(range(1,n+1)) and all(0<=x<=m for x in counts) and sum(counts)<=m and sum(a[c-1][k-1] if k else 0 for c,k in zip(companies,counts))==opt
        if pid==3954:
            f,cols=v[:2];a=[v[2+i*cols:2+(i+1)*cols] for i in range(f)];opt,_=flowers(f,cols,a)
            if len(t)!=f+1 or int(t[0])!=opt:return False
            p=list(map(int,t[1:]));return p==sorted(set(p)) and all(1<=x<=cols for x in p) and sum(a[i][j-1] for i,j in enumerate(p))==opt
    except (ValueError,IndexError,KeyError,StopIteration):return False
