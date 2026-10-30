"""Independent calculations and witness validation for the final 49 problems."""
from collections import Counter,deque
import heapq,math,re


def adjacency_lists(text, counted=False):
    rows=[list(map(int,row.split())) for row in text.strip().splitlines()]
    n=rows[0][0];g=[]
    for row in rows[1:]:g.append([x-1 for x in (row[1:] if counted else row[:-1])])
    return n,g


class DSU:
    def __init__(self,n):self.p=list(range(n));self.size=[1]*n
    def find(self,x):
        while self.p[x]!=x:self.p[x]=self.p[self.p[x]];x=self.p[x]
        return x
    def union(self,a,b):
        a,b=self.find(a),self.find(b)
        if a==b:return False
        if self.size[a]<self.size[b]:a,b=b,a
        self.p[b]=a;self.size[a]+=self.size[b];return True


def mst(n,edges):
    d=DSU(n);cost=0;chosen=[]
    for a,b,w in sorted(edges,key=lambda e:(e[2],e[0],e[1])):
        if d.union(a,b):cost+=w;chosen.append((a,b))
    return cost,chosen


def prim(n,edges):
    g=[[] for _ in range(n)]
    for a,b,w in edges:g[a].append((b,w));g[b].append((a,w))
    total=0;seen=set()
    for start in range(n):
        if start in seen:continue
        q=[(0,start)]
        while q:
            w,u=heapq.heappop(q)
            if u in seen:continue
            seen.add(u);total+=w
            for v,z in g[u]:
                if v not in seen:heapq.heappush(q,(z,v))
    return total


def weighted_graph(n,edges,directed=False):
    g=[[] for _ in range(n)]
    for u,v,w in edges:
        g[u].append((v,w))
        if not directed:g[v].append((u,w))
    return g


def dijkstra(g,start):
    d=[math.inf]*len(g);d[start]=0;q=[(0,start)]
    while q:
        x,u=heapq.heappop(q)
        if x!=d[u]:continue
        for v,w in g[u]:
            if x+w<d[v]:d[v]=x+w;heapq.heappush(q,(d[v],v))
    return d


def bfs(g,start):
    d=[-1]*len(g);d[start]=0;q=deque([start])
    while q:
        u=q.popleft()
        for v in g[u]:
            if d[v]<0:d[v]=d[u]+1;q.append(v)
    return d


def closure(g):
    reach=[]
    for start in range(len(g)):
        seen={start};q=[start]
        for u in q:
            for v in g[u]:
                if v not in seen:seen.add(v);q.append(v)
        reach.append(seen)
    return reach


def matching(g,blocked=None):
    n=len(g);mate=[-1]*n
    def augment(u,seen):
        for v in g[u]:
            if (u,v)==blocked or v in seen:continue
            seen.add(v)
            if mate[v]<0 or augment(mate[v],seen):mate[v]=u;return True
        return False
    if not all(augment(u,set()) for u in range(n)):return None
    return mate


def expression(text,power=False):
    """Recursive precedence parser; binary operators (including ^) associate left."""
    s=text.strip();i=0
    def atom():
        nonlocal i
        if i>=len(s):raise ValueError('missing operand')
        if s[i]=='-':i+=1;return -atom()
        if s[i]=='(':
            i+=1;x=parse(1)
            if i>=len(s) or s[i]!=')':raise ValueError('unclosed parenthesis')
            i+=1;return x
        start=i
        while i<len(s) and '0'<=s[i]<='9':i+=1
        if start==i:raise ValueError('invalid operand')
        return int(s[start:i])
    priority={'+':1,'-':1,'*':2,'/':2}
    if power:priority['^']=3
    def parse(level):
        nonlocal i
        x=atom()
        while i<len(s) and priority.get(s[i],0)>=level:
            op=s[i];p=priority[op];i+=1;y=parse(p+1)
            if op=='+':x+=y
            elif op=='-':x-=y
            elif op=='*':x*=y
            elif op=='/':
                if not y:raise ValueError('division by zero')
                x=(1 if x*y>=0 else -1)*(abs(x)//abs(y))
            else:
                if not 0<=y<=2147483647:raise ValueError('invalid exponent')
                if abs(x)>1 and y>63:raise ValueError('numeric overflow')
                x=pow(x,y)
            if abs(x)>2**63-1:raise ValueError('numeric overflow')
        return x
    answer=parse(1)
    if i!=len(s):raise ValueError('extra expression token')
    return answer


def bracket_match(s,hierarchy=False):
    stack=[];pairs={')':'(',']':'[','}':'{','>':'<'};rank={'<':0,'(':1,'[':2,'{':3}
    for c in s:
        if c in rank:
            if hierarchy and stack and rank[c]>rank[stack[-1]]:return False
            stack.append(c)
        elif c in pairs:
            if not stack or stack.pop()!=pairs[c]:return False
        else:return False
    return not stack


def tree_pre_in(pre,inside):
    if not pre:return None
    k=inside.index(pre[0]);return pre[0],tree_pre_in(pre[1:k+1],inside[:k]),tree_pre_in(pre[k+1:],inside[k+1:])


def solve(pid,text):
    t=text.split()
    if pid==4023:
        n,m=map(int,t[:2]);edges=[(int(a)-1,int(b)-1,int(w)) for a,b,w in zip(t[2::3],t[3::3],t[4::3])]
        _,chosen=mst(n,edges);return '\n'.join(f'{a+1} {b+1}' for a,b in chosen)
    if pid in [4024,4025]:
        n=int(t[0]);a=list(map(int,t[1:]));return str(mst(n,[(i,j,a[i*n+j]) for i in range(n) for j in range(i)])[0])
    if pid==4026:
        n,g=adjacency_lists(text);degree=[0]*n
        for row in g:
            for v in row:degree[v]+=1
        q=[i for i in range(n) if not degree[i]];heapq.heapify(q);order=[]
        while q:
            u=heapq.heappop(q);order.append(u+1)
            for v in g[u]:
                degree[v]-=1
                if not degree[v]:heapq.heappush(q,v)
        assert len(order)==n,'no topological order';return ' '.join(map(str,order))
    if pid==4027:
        n,m=map(int,t[:2]);g=[[] for _ in range(n)];degree=[0]*n;money=[100]*n
        for a,b in zip(t[2::2],t[3::2]):u,v=int(b)-1,int(a)-1;g[u].append(v);degree[v]+=1
        q=deque(i for i in range(n) if not degree[i]);seen=0
        while q:
            u=q.popleft();seen+=1
            for v in g[u]:
                money[v]=max(money[v],money[u]+1);degree[v]-=1
                if not degree[v]:q.append(v)
        return str(sum(money)) if seen==n else 'Poor Xed'
    if pid==4028:
        count=0
        for ch in text.strip()[:-1]:
            if ch=='(':count+=1
            if ch==')':count-=1
            if count<0:return 'NO'
        return 'YES' if count==0 else 'NO'
    if pid==4029:return 'OK' if bracket_match(text.strip()) else 'Wrong'
    if pid==4030:return '\n'.join('YES' if bracket_match(s,True) else 'NO' for s in t[1:])
    if pid==4031:return str(expression(text,True))
    if pid==4032:
        n=int(t[0]);a=list(map(int,t[1:]));stack=[];next_car=1
        for x in a:
            while next_car<=n and (not stack or stack[-1]!=x):stack.append(next_car);next_car+=1
            if not stack or stack.pop()!=x:return 'NO'
        return 'YES'
    if pid==4033:
        try:
            assert text.strip().endswith('@');return str(expression(text.strip()[:-1]))
        except (AssertionError,ValueError):return 'NO'
    if pid==4034:
        a=list(map(int,t));outside=set();q=[]
        for i in range(100):
            if a[i]==0 and (i//10 in [0,9] or i%10 in [0,9]):outside.add(i);q.append(i)
        for u in q:
            x,y=divmod(u,10)
            for xx,yy in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if 0<=xx<10 and 0<=yy<10:
                    v=xx*10+yy
                    if not a[v] and v not in outside:outside.add(v);q.append(v)
        return str(a.count(0)-len(outside))
    if pid==4035:
        n,start,end=map(int,t[:3]);a=list(map(int,t[3:]));g=[[v for v in [u-a[u],u+a[u]] if 0<=v<n] for u in range(n)]
        return str(bfs(g,start-1)[end-1])
    if pid==4036:
        g=[[] for _ in range(10)]
        for a,b in zip(t[2::2],t[3::2]):g[int(a)].append(int(b))
        r=closure(g);return str(math.prod(len(r[int(c)]) for c in t[0]))
    if pid==4037:
        n,k=map(int,t[:2]);d=DSU(n)
        for a,b in zip(t[2::2],t[3::2]):d.union(int(a)-1,int(b)-1)
        counts=Counter(d.find(i) for i in range(n));return f'{len(counts)} {max(counts.values())}'
    if pid==4038:
        depth,ball=map(int,t);bits=bin(ball-1)[2:].zfill(depth-1)[::-1];return str(2**(depth-1)+int(bits,2))
    if pid==4039:
        inside,level=t
        def visit(s,order):
            if not s:return ''
            root=next(c for c in order if c in s);i=s.index(root);return root+visit(s[:i],order)+visit(s[i+1:],order)
        return visit(inside,level)
    if pid==4040:
        def visit(s):
            kind='B' if '1' not in s else 'I' if '0' not in s else 'F'
            return (visit(s[:len(s)//2])+visit(s[len(s)//2:]) if len(s)>1 else '')+kind
        return visit(t[1])
    if pid==4041:
        tree=tree_pre_in(*t);lines=[]
        def count(tree):return 0 if tree is None else 1 if tree[1] is tree[2] is None else count(tree[1])+count(tree[2])
        def visit(tree):
            if tree is not None:lines.append(tree[0]*count(tree));visit(tree[1]);visit(tree[2])
        visit(tree);return '\n'.join(lines)
    if pid==4042:
        n,target=map(int,t[:2]);a=[tuple(map(int,r)) for r in zip(t[2::3],t[3::3],t[4::3])];seq=[]
        def visit(u):
            if u:_,l,r=a[u-1];visit(l);seq.append(a[u-1][0]);visit(r)
        visit(1);return str(seq.index(target)+1 if target in seq else 0)
    if pid==4043:
        s=t[0]
        for i in range(1,len(s),2):
            if (s[i]=='#')!=((s[i+1] if i+1<len(s) else '#')=='#'):return 'No'
        return 'Yes'
    if pid==4044:
        a=list(map(int,t[1:]));heapq.heapify(a);cost=0
        while len(a)>1:x=heapq.heappop(a)+heapq.heappop(a);cost+=x;heapq.heappush(a,x)
        return str(cost)
    if pid==4045:
        n,m=map(int,t[:2]);a=[tuple(map(int,r)) for r in zip(t[2::3],t[3::3],t[4::3])];q=[];out=[]
        def value(i,x):aa,b,c=a[i];return aa*x*x+b*x+c
        for i in range(n):heapq.heappush(q,(value(i,1),i,1))
        for _ in range(m):v,i,x=heapq.heappop(q);out.append(v);heapq.heappush(q,(value(i,x+1),i,x+1))
        return ' '.join(map(str,out))
    if pid==4046:
        q=[];lines=[];i=1
        for _ in range(int(t[0])):
            op=t[i];i+=1
            if op=='push':name,priority=t[i:i+2];i+=2;heapq.heappush(q,(-int(priority),name))
            elif q:p,name=heapq.heappop(q);lines.append(f'{name} {-p}')
            else:lines.append('none')
        return '\n'.join(lines)
    if pid==4047:
        counts=Counter();lo=[];hi=[];i=1;out=[]
        def take(q,sign):
            while not counts[sign*q[0]]:heapq.heappop(q)
            v=sign*heapq.heappop(q);counts[v]-=1;return v
        for _ in range(int(t[0])):
            m=int(t[i]);i+=1
            for v in map(int,t[i:i+m]):counts[v]+=1;heapq.heappush(lo,v);heapq.heappush(hi,-v)
            i+=m;a=take(lo,1);b=take(hi,-1);out.append(f'{a} {b}')
        return '\n'.join(out)
    if pid==4048:
        n=int(t[0]);f=list(map(int,t[1:n+1]));d=list(map(int,t[n+1:2*n+1]));travel=list(map(int,t[2*n+1:-1]));T=int(t[-1]);best=0;spent=0
        for last in range(n):
            if last:spent+=travel[last-1]
            time=T-spent
            if time<=0:continue
            values=sorted((max(0,f[i]-d[i]*k) for i in range(last+1) for k in range(min(time,(f[i]+d[i]-1)//d[i]) if d[i] else time)),reverse=True)
            best=max(best,sum(values[:time]))
        return str(best)
    if pid==4049:
        coords=list(map(int,t[2:]));length=sum(math.hypot(c-a,d-b) for a,b,c,d in zip(coords[::4],coords[1::4],coords[2::4],coords[3::4]));minutes=int(length*2/20000*60+0.5);return f'{minutes//60}:{minutes%60:02d}'
    if pid==4050:
        g=[Counter() for _ in range(501)];degree=[0]*501
        for a,b in zip(t[1::2],t[2::2]):a,b=int(a),int(b);g[a][b]+=1;g[b][a]+=1;degree[a]+=1;degree[b]+=1
        start=next((i for i in range(1,501) if degree[i]%2),next(i for i in range(1,501) if degree[i]));path=[]
        def visit(u):
            for v in sorted(g[u]):
                while g[u][v]:g[u][v]-=1;g[v][u]-=1;visit(v)
            path.append(u)
        import sys
        old=sys.getrecursionlimit();sys.setrecursionlimit(max(old,4096));visit(start);sys.setrecursionlimit(old)
        return '\n'.join(map(str,path[::-1]))
    if pid==4052:
        lines=text.strip().splitlines();m,n=map(int,lines[0].split());g=[set() for _ in range(n)]
        for line in lines[1:]:
            a=[int(x)-1 for x in line.split()]
            for i,u in enumerate(a):g[u].update(a[i+1:])
        d=bfs(g,0);return 'NO' if d[-1]<0 else str(max(0,d[-1]-1))
    if pid==4053:
        n,start=map(int,t[:2]);a=t[2:];edges=[(i,j,int(a[i*n+j])) for i in range(n) for j in range(n) if a[i*n+j]!='-'];d=[math.inf]*n;d[start-1]=0
        for _ in range(n-1):
            old=d[:]
            for u,v,w in edges:d[v]=min(d[v],old[u]+w)
            if d==old:break
        return '\n'.join(f'({start} -> {i+1}) = '+('INF' if d[i]==math.inf else str(d[i])) for i in range(n) if i!=start-1)
    if pid in [4051,4054,4056,4057]:
        if pid==4054:n,m,start,end=map(int,t[:4]);offset=4
        else:n,m=map(int,t[:2]);start,end=1,n;offset=2
        edges=[(int(a)-1,int(b)-1,int(w)) for a,b,w in zip(t[offset::3],t[offset+1::3],t[offset+2::3])];d=dijkstra(weighted_graph(n,edges),start-1)
        result=max(d) if pid==4051 else d[end-1];return str(-1 if result==math.inf else result)
    if pid==4055:
        n,p,start,m=map(int,t[:4]);g=[[] for _ in range(n)]
        for a,b in zip(t[4::2],t[5::2]):u,v=int(a)-1,int(b)-1;g[u].append(v);g[v].append(u)
        d=bfs(g,start-1);assert min(d)>=0;return str(max(d)+m+1)
    if pid==4058:
        n,g=adjacency_lists(text);r=closure(g);groups=[];used=set()
        for i in range(n):
            if i not in used:s={j for j in r[i] if i in r[j]};groups.append(s);used|=s
        return str(sum(not any(v in s and u not in s for u in range(n) for v in g[u]) for s in groups))
    if pid==4059:
        n,m=map(int,t[:2]);g=[[] for _ in range(n)]
        for a,b in zip(t[2::2],t[3::2]):g[int(a)-1].append(int(b)-1)
        r=closure(g);return str(sum(len(r[i])-1>n//2 or sum(i in s for s in r)-1>n//2 for i in range(n)))
    if pid==4060:
        n,m=map(int,t[:2]);g=[[] for _ in range(n)]
        for p,a,b in zip(t[2::3],t[3::3],t[4::3]):a,b=int(a)-1,int(b)-1;g[a].append((b,int(p)));g[b].append((a,int(p)))
        color=[-1]*n;count=0
        for start in range(n):
            if color[start]>=0:continue
            color[start]=0;q=[start];classes={0}
            for u in q:
                for v,z in g[u]:
                    c=color[u]^z
                    if color[v]<0:color[v]=c;q.append(v);classes.add(c)
                    else:assert color[v]==c,'inconsistent friend/enemy relations'
            count+=len(classes)
        return str(count)
    if pid==4061:
        n,g=adjacency_lists(text,True)
        def sufficient(k):
            used=set(range(k))
            for i in range(k,n):
                if i in used:continue
                used.add(i);q=[i]
                for u in q:
                    for v in g[u]:
                        if v not in used:used.add(v);q.append(v)
                if len(q)>n//2:return False
            return True
        lo,hi=0,n
        while lo<hi:mid=(lo+hi)//2;lo,hi=(lo,mid) if sufficient(mid) else (mid+1,hi)
        return str(lo)
    if pid==4062:
        n,m,budget=map(int,t[:3]);prices=list(map(int,t[3:3+2*n:2]));values=list(map(int,t[4:3+2*n:2]));d=DSU(n)
        for a,b in zip(t[3+2*n::2],t[4+2*n::2]):d.union(int(a)-1,int(b)-1)
        groups={}
        for i in range(n):r=d.find(i);p,v=groups.get(r,(0,0));groups[r]=(p+prices[i],v+values[i])
        dp=[0]*(budget+1)
        for price,value in groups.values():
            for x in range(budget,price-1,-1):dp[x]=max(dp[x],dp[x-price]+value)
        return str(dp[budget])
    if pid==4063:
        father={};parent=None;out=[]
        for token in t:
            if token=='$':break
            name=token[1:];father.setdefault(name,name)
            if token[0]=='#':parent=name
            elif token[0]=='+':father[name]=parent
            else:
                x=name
                while father[x]!=x:x=father[x]
                out.append(f'{name} {x}')
        return '\n'.join(out)
    if pid==4064:
        n,m=map(int,t[:2]);d=DSU(n);out=[];i=2
        for _ in range(m):
            op=t[i];a=int(t[i+1])-1;i+=2
            if op=='M':b=int(t[i])-1;i+=1;d.union(a,b)
            else:out.append(str(d.size[d.find(a)]))
        return '\n'.join(out)
    if pid==4065:
        n,k=map(int,t[:2]);p=list(range(n));delta=[0]*n;size=[1]*n;lies=0
        def find(x):
            if p[x]!=x:
                old=p[x];p[x]=find(old);delta[x]=(delta[x]+delta[old])%3
            return p[x]
        for kind,x,y in zip(t[2::3],t[3::3],t[4::3]):
            kind,x,y=int(kind),int(x)-1,int(y)-1
            if not 0<=x<n or not 0<=y<n:lies+=1;continue
            a,b=find(x),find(y);wanted=kind-1
            if a==b:
                if (delta[x]-delta[y])%3!=wanted:lies+=1
            else:
                value=(wanted-delta[x]+delta[y])%3
                if size[a]<size[b]:p[a]=b;delta[a]=value;size[b]+=size[a]
                else:p[b]=a;delta[b]=-value%3;size[a]+=size[b]
        return str(lies)
    if pid in [4066,4067,4068]:
        n,m=map(int,t[:2])
        if pid!=4068:
            edges=[(int(a)-1,int(b)-1,int(w)) for a,b,w in zip(t[2::3],t[3::3],t[4::3])];cost,chosen=mst(n,edges)
            if pid==4066:return str(sum(w for _,_,w in edges)-cost)
            if n==1:return '0 0'
            weights={(min(a,b),max(a,b)):w for a,b,w in edges};return f'{n-1} {max(weights[(min(a,b),max(a,b))] for a,b in chosen)}'
        d=DSU(n);cost=0;optional=[]
        for kind,a,b,w in zip(t[2::4],t[3::4],t[4::4],t[5::4]):
            a,b,w=int(a)-1,int(b)-1,int(w)
            if kind=='1':d.union(a,b);cost+=w
            else:optional.append((a,b,w))
        for a,b,w in sorted(optional,key=lambda e:e[2]):
            if d.union(a,b):cost+=w
        return str(cost)
    if pid==4069:
        m,n=map(int,t[:2]);d=DSU(m*n);cost=0
        for x,y,a,b in zip(t[2::4],t[3::4],t[4::4],t[5::4]):d.union((int(x)-1)*n+int(y)-1,(int(a)-1)*n+int(b)-1)
        # Kruskal over all vertical edges, then all horizontal edges.
        for x in range(m-1):
            for y in range(n):
                if d.union(x*n+y,(x+1)*n+y):cost+=1
        for x in range(m):
            for y in range(n-1):
                if d.union(x*n+y,x*n+y+1):cost+=2
        return str(cost)
    if pid==4070:
        n=int(t[0]);rect=[tuple(map(int,r)) for r in zip(t[1:1+4*n:4],t[2:1+4*n:4],t[3:1+4*n:4],t[4:1+4*n:4])];points=[tuple(map(int,r)) for r in zip(t[1+4*n::2],t[2+4*n::2])];g=[[j for j,(x,y) in enumerate(points) if a<=x<=b and c<=y<=d] for a,b,c,d in rect];mate=matching(g)
        if mate is None:return 'None'
        result=[-1]*n
        for v,u in enumerate(mate):result[u]=v
        if any(matching(g,(u,v)) is not None for u,v in enumerate(result)):return 'None'
        return '\n'.join(f'{chr(65+u)} {v+1}' for u,v in enumerate(result))
    if pid==4071:
        n=int(t[0]);words=t[1:n+1];target=t[-1];alphabet=set(''.join(words)+target);g={c:set() for c in alphabet};degree=dict.fromkeys(alphabet,0)
        for a,b in zip(words,words[1:]):
            first=next(((x,y) for x,y in zip(a,b) if x!=y),None)
            if first is None:
                if len(a)>len(b):return '0'
            else:
                x,y=first
                if y not in g[x]:g[x].add(y);degree[y]+=1
        order=[];q=[c for c in alphabet if not degree[c]]
        while q:
            if len(q)!=1:return '0'
            u=q.pop();order.append(u)
            for v in g[u]:
                degree[v]-=1
                if degree[v]==0:q.append(v)
        if len(order)!=len(alphabet):return '0'
        mapping={c:chr(97+i) for i,c in enumerate(order)};return ''.join(mapping[c] for c in target)
    raise KeyError(pid)


def equivalent(pid,text,output):
    try:
        tokens=output.split()
        if pid==4026:
            n,g=adjacency_lists(text);order=list(map(int,tokens))
            if len(order)!=n or set(order)!=set(range(1,n+1)):return False
            position={u:i for i,u in enumerate(order)};return all(position[u+1]<position[v+1] for u,row in enumerate(g) for v in row)
        if pid==4023:
            t=list(map(int,text.split()));n,m=t[:2];edges=list(zip((x-1 for x in t[2::3]),(x-1 for x in t[3::3]),t[4::3]));weights={}
            for a,b,w in edges:key=tuple(sorted((a,b)));weights[key]=min(w,weights.get(key,math.inf))
            if len(tokens)!=2*(n-1):return False
            values=list(map(int,tokens));d=DSU(n);cost=0
            for a,b in zip(values[::2],values[1::2]):
                a,b=a-1,b-1;key=tuple(sorted((a,b)))
                if key not in weights or not d.union(a,b):return False
                cost+=weights[key]
            return cost==prim(n,edges)
        return [s.rstrip() for s in output.strip().splitlines()]==[s.rstrip() for s in solve(pid,text).strip().splitlines()]
    except (ValueError,IndexError,AssertionError,KeyError):return False
