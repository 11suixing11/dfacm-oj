"""Validate final chapter inputs against their repaired statement guarantees."""
from collections import Counter,deque
from pathlib import Path
import importlib.util,re

spec=importlib.util.spec_from_file_location('ch8',Path(__file__).with_name('oracle-chapter8.py'));ch8=importlib.util.module_from_spec(spec);spec.loader.exec_module(ch8)


def connected(n,edges,required=None):
    d=ch8.DSU(n)
    for a,b in edges:d.union(a,b)
    nodes=list(range(n)) if required is None else list(required)
    return not nodes or all(d.find(u)==d.find(nodes[0]) for u in nodes)


def dag(g):
    degree=[0]*len(g)
    for row in g:
        for v in row:degree[v]+=1
    q=deque(i for i,x in enumerate(degree) if not x);seen=0
    while q:
        u=q.popleft();seen+=1
        for v in g[u]:
            degree[v]-=1
            if degree[v]==0:q.append(v)
    return seen==len(g)


def rooted_tree(a):
    n=len(a);degree=[0]*n;edges=[]
    for i,(_,l,r) in enumerate(a):
        for v in [l,r]:
            assert 0<=v<=n,'child index'
            if v:degree[v-1]+=1;edges.append((i,v-1))
    assert degree[0]==0 and all(v==1 for v in degree[1:]) and connected(n,edges),'one tree rooted at node 1'


def validate(pid,text):
    assert all(ord(c)>=32 or c in '\r\n\t' for c in text) and '\ufffd' not in text,'invalid encoding or control characters'
    t=text.split();assert t,'nonempty input'
    if pid==4028:
        s=text.strip();assert len(s)<255 and s.count('@')==1 and s.endswith('@') and s.count('(')<20
        assert re.fullmatch('[a-z0-9()+*/-]+@',s),'ASCII operands/operators and terminal @';return
    if pid==4029:
        s=text.strip();assert 1<=len(s)<255 and set(s)<=set('()[]');return
    if pid==4030:
        assert t[0].isdigit() and int(t[0])>=1 and len(t)==int(t[0])+1
        assert all(1<=len(s)<=255 and set(s)<=set('()[]<>{}') for s in t[1:]);return
    if pid in [4031,4033]:
        s=text.strip();assert len(s)<=2000 and re.fullmatch(r'[0-9()+*/^@-]+',s)
        if pid==4031:assert '@' not in s;ch8.expression(s,True)
        else:assert s.count('@')==1 and s.endswith('@') and '^' not in s
        return
    if pid in [4039,4041]:
        assert len(t)==2 and all(re.fullmatch('[A-Za-z]{1,52}',s) and len(set(s))==len(s) for s in t) and set(t[0])==set(t[1])
        if pid==4041:ch8.tree_pre_in(*t)
        return
    if pid==4043:
        s=t[0];assert len(t)==1 and 1<=len(s)<=1000 and re.fullmatch('[A-Za-z#]+',s)
        labels=s.replace('#','');assert len(labels)==len(set(labels))
        for i,c in enumerate(s):
            if i and c!='#':assert s[(i-1)//2]!='#','no occupied child of empty parent'
        return
    if pid==4046:
        assert t[0].isdigit() and 1<=int(t[0])<=100000;i=1;priorities=set()
        for _ in range(int(t[0])):
            assert i<len(t);op=t[i];i+=1;assert op in ['push','pop']
            if op=='push':
                assert i+1<len(t) and re.fullmatch('[a-z]{1,19}',t[i]);p=int(t[i+1]);assert 0<=p<=2000000000 and p not in priorities,'distinct patient priorities';priorities.add(p);i+=2
        assert i==len(t);return
    if pid==4063:
        assert t[-1]=='$' and t.count('$')==1;father={};current=None;groups=0
        for token in t[:-1]:
            assert re.fullmatch('[#+?][A-Z][A-Za-z]{5}',token),'six-character name and command'
            name=token[1:];father.setdefault(name,name)
            if token[0]=='#':current=name;groups+=1
            elif token[0]=='+':
                assert current is not None and name!=current and father[name] in [name,current],'one biological parent'
                father[name]=current
        assert groups<=1000 and len(father)<=50000
        for name in father:
            seen=set();u=name
            while father[u]!=u:assert u not in seen,'acyclic ancestry';seen.add(u);u=father[u]
            assert len(seen)<=30,'at most 30 generations'
        return
    if pid==4064:
        rows=[r.split() for r in text.strip().splitlines()];assert len(rows[0])==2;n,m=map(int,rows[0]);assert 1<=n<=100000 and 0<=m<=200000 and len(rows)==m+1
        for r in rows[1:]:assert r[0] in ['M','Q'] and len(r)==(3 if r[0]=='M' else 2) and all(1<=int(x)<=n for x in r[1:]),'M a b or Q a'
        return
    if pid==4071:
        n=int(t[0]);assert 1<=n<=50000 and len(t)==n+2 and all(re.fullmatch('[a-z]{1,100}',s) for s in t[1:]);return
    if pid in [4026,4058,4061]:
        rows=[list(map(int,r.split())) for r in text.strip().splitlines()];assert len(rows[0])==1;n=rows[0][0]
        assert (1 if pid!=4058 else 2)<=n<=(100 if pid==4026 else 200 if pid==4058 else 1000) and len(rows)==n+1
        g=[]
        for row in rows[1:]:
            assert row
            if pid==4061:assert row[0]==len(row)-1;neighbors=row[1:]
            else:assert row[-1]==0 and 0 not in row[:-1];neighbors=row[:-1]
            assert all(1<=v<=n for v in neighbors) and len(set(neighbors))==len(neighbors);g.append([v-1 for v in neighbors])
        if pid==4026:assert dag(g),'acyclic ancestry graph'
        if pid==4061:assert all(u in g[v] for u,row in enumerate(g) for v in row) and connected(n,[(u,v) for u,row in enumerate(g) for v in row]),'connected undirected group network'
        return
    if pid==4052:
        rows=[list(map(int,r.split())) for r in text.strip().splitlines()];assert len(rows[0])==2;m,n=rows[0];assert 1<=m<=100 and 2<=n<=500 and len(rows)==m+1
        assert all(row and all(1<=v<=n for v in row) and len(set(row))==len(row) for row in rows[1:]);return
    if pid==4053:
        n,start=map(int,t[:2]);assert 2<=n<=80 and 1<=start<=n and len(t)==n*n+2
        a=t[2:];edges=[]
        for i in range(n):
            for j in range(n):
                s=a[i*n+j];assert s=='-' or re.fullmatch('-?[0-9]+',s)
                if s!='-':w=int(s);assert abs(w)<=10**12*2;edges.append((i,j,w))
            assert a[i*n+i]=='0','zero diagonal'
        d=[[None]*n for _ in range(n)]
        for i in range(n):d[i][i]=0
        for i,j,w in edges:d[i][j]=min(d[i][j] if d[i][j] is not None else w,w)
        for k in range(n):
            for i in range(n):
                if d[i][k] is None:continue
                for j in range(n):
                    if d[k][j] is not None:
                        x=d[i][k]+d[k][j]
                        if d[i][j] is None or x<d[i][j]:d[i][j]=x
        assert all(d[i][i]>=0 for i in range(n)),'no negative cycle'
        assert all(d[j][i] is None or w+d[j][i]>0 for i,j,w in edges if i!=j),'every nontrivial directed cycle has positive weight';return
    assert all(re.fullmatch('-?[0-9]+',s) for s in t),'integer tokens';v=list(map(int,t));n=v[0]
    if pid in [4024,4025]:
        assert (2 if pid==4024 else 3)<=n<=100 and len(v)==1+n*n;a=v[1:]
        assert all(0<=x<=(2147483647 if pid==4024 else 100000) for x in a) and all(a[i*n+i]==0 and all(a[i*n+j]==a[j*n+i] for j in range(n)) for i in range(n)),'symmetric cost matrix';return
    if pid==4023:
        m=v[1];assert 2<=n<=100 and m>=n-1 and len(v)==3*m+2;edges=[]
        for a,b,w in zip(v[2::3],v[3::3],v[4::3]):assert 1<=a<=n and 1<=b<=n and 1<=w<=2147483647;edges.append((a-1,b-1))
        assert connected(n,edges);return
    if pid==4027:assert 1<=n<=10000 and 0<=v[1]<=20000 and len(v)==2+2*v[1] and all(1<=x<=n for x in v[2:]);return
    if pid==4032:assert 1<=n<=1000 and len(v)==n+1 and set(v[1:])==set(range(1,n+1));return
    if pid==4034:assert len(v)==100 and set(v)<=set([0,1]),'complete 10 by 10 binary grid';return
    if pid==4035:assert 1<=n<=200 and len(v)==n+3 and all(1<=x<=n for x in v[1:3]) and all(0<=x<=n for x in v[3:]);return
    if pid==4036:assert 0<=n<=2000 and 0<=v[1]<=15 and len(v)==2+2*v[1] and all(0<=x<=9 and 1<=y<=9 for x,y in zip(v[2::2],v[3::2]));return
    if pid==4037:assert 1<=n<=100 and v[1]>=0 and len(v)==2+2*v[1] and all(1<=x<=n for x in v[2:]);return
    if pid==4038:assert len(v)==2 and 2<=n<=20 and 1<=v[1]<=2**(n-1);return
    if pid==4040:assert len(t)==2 and 0<=n<=10 and len(t[1])==2**n and set(t[1])<=set('01');return
    if pid==4042:
        assert 1<=n<=100 and len(v)==2+3*n;rows=list(zip(v[2::3],v[3::3],v[4::3]));rooted_tree(rows);return
    if pid==4044:
        assert 1<=n<=30000 and len(v)==n+1 and all(1<=x<=20000 for x in v[1:]);assert int(ch8.solve(pid,text))<2**31,'guaranteed 32-bit minimum merge cost';return
    if pid==4045:assert 1<=n<=10000 and 1<=v[1]<=10000 and len(v)==2+3*n and all(1<=a<=10 and 1<=b<=100 and 1<=c<=10000 for a,b,c in zip(v[2::3],v[3::3],v[4::3]));return
    if pid==4047:
        assert 1<=n<=15000;i=1;available=0
        for _ in range(n):
            assert i<len(v);m=v[i];i+=1;assert 0<=m<=100 and i+m<=len(v) and all(1<=x<1000000000 for x in v[i:i+m]);i+=m;available+=m;assert available>=2;available-=2
        assert i==len(v);return
    if pid==4048:
        assert 1<=n<100 and len(v)==3*n+1 and 1<=v[-1]<1000,'strict pond/time range'
        assert all(1<=x<=1000 for x in v[1:n+1]) and all(1<=x<=100 for x in v[n+1:2*n+1]) and all(0<=x<=2147483647 for x in v[2*n+1:-1]);return
    if pid==4049:
        assert len(v)>=2 and (len(v)-2)%4==0 and (len(v)-2)//4<=100 and all(-2147483648<=x<=2147483647 for x in v)
        segments=[((a,b),(c,d)) for a,b,c,d in zip(v[2::4],v[3::4],v[4::4],v[5::4])]
        def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        def on(a,b,c):return cross(a,b,c)==0 and min(a[0],b[0])<=c[0]<=max(a[0],b[0]) and min(a[1],b[1])<=c[1]<=max(a[1],b[1])
        def intersect(a,b,c,d):
            if any([on(a,b,c),on(a,b,d),on(c,d,a),on(c,d,b)]):return True
            return cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0
        d=ch8.DSU(len(segments)+1);start=tuple(v[:2])
        for i,(a,b) in enumerate(segments):
            if on(a,b,start):d.union(i,len(segments))
            for j,(c,e) in enumerate(segments[:i]):
                if intersect(a,b,c,e):d.union(i,j)
        assert all(d.find(i)==d.find(len(segments)) for i in range(len(segments))),'every street reachable from snowplow start, including intersections';return
    if pid==4050:
        assert 1<=n<=1024 and len(v)==1+2*n;degree=Counter();edges=[]
        for a,b in zip(v[1::2],v[2::2]):assert 1<=a<=500 and 1<=b<=500 and a!=b;degree[a-1]+=1;degree[b-1]+=1;edges.append((a-1,b-1))
        assert connected(500,edges,degree) and sum(x%2 for x in degree.values()) in [0,2];return
    if pid in [4051,4054,4056,4057]:
        m=v[1];offset=4 if pid==4054 else 2
        maxn={4051:100,4054:2500,4056:2000,4057:100000}[pid];maxm={4051:100000,4054:6200,4056:10000,4057:500000}[pid]
        assert 1<=n<=maxn and (1 if pid in [4054,4056] else 0)<=m<=maxm and len(v)==offset+3*m
        if pid==4054:assert 1<=v[2]<=n and 1<=v[3]<=n
        edges=[]
        for a,b,w in zip(v[offset::3],v[offset+1::3],v[offset+2::3]):
            assert 1<=a<=n and 1<=b<=n and (0 if pid==4056 else 1)<=w<=(1000 if pid in [4054,4057] else 10000 if pid==4056 else 2147483647);edges.append((a-1,b-1))
        if pid in [4054,4057]:
            d=ch8.DSU(n)
            for a,b in edges:d.union(a,b)
            assert d.find((v[2] if pid==4054 else 1)-1)==d.find((v[3] if pid==4054 else n)-1),'source and destination reachable'
        return
    if pid==4055:
        p,start,time=v[1:4];assert 1<=n<=100000 and 0<=p<=n*(n-1)//2 and 1<=start<=n and 0<=time<=2147483647 and len(v)==4+2*p
        edges=[tuple(sorted((a-1,b-1))) for a,b in zip(v[4::2],v[5::2])];assert all(0<=a<n and 0<=b<n and a!=b for a,b in edges) and len(set(edges))==p and connected(n,edges),'unique relations and every child receives candy';return
    if pid==4059:
        m=v[1];assert 1<=n<=99 and n%2==1 and m>=0 and len(v)==2+2*m;g=[[] for _ in range(n)]
        for a,b in zip(v[2::2],v[3::2]):assert 1<=a<=n and 1<=b<=n;g[a-1].append(b-1)
        assert dag(g),'consistent strict weight comparisons';return
    if pid==4060:
        assert 1<n<1000 and 1<=v[1]<=100000 and len(v)==2+3*v[1] and all(p in [0,1] and 1<=a<=n and 1<=b<=n for p,a,b in zip(v[2::3],v[3::3],v[4::3]));ch8.solve(pid,text);return
    if pid==4062:assert 1<=n<=10000 and 0<=v[1]<=5000 and 0<=v[2]<=10000 and len(v)==3+2*n+2*v[1] and all(0<=x<=2147483647 for x in v[3:3+2*n]) and all(1<=x<=n for x in v[3+2*n:]);return
    if pid==4065:assert 1<=n<=50000 and 0<=v[1]<=100000 and len(v)==2+3*v[1] and all(d in [1,2] and x>0 and y>0 for d,x,y in zip(v[2::3],v[3::3],v[4::3]));return
    if pid in [4066,4067,4068]:
        m=v[1];width=4 if pid==4068 else 3;assert 1<=n<=(100 if pid==4066 else 300 if pid==4067 else 2000) and m>=0 and len(v)==2+width*m;edges=[]
        if pid==4068:assert m<=10000
        for i in range(m):
            row=v[2+width*i:2+width*(i+1)]
            if pid==4068:assert row[0] in [1,2];a,b,w=row[1:]
            else:a,b,w=row
            assert 1<=a<=n and 1<=b<=n and (0 if pid==4068 else 1)<=w<=(1000 if pid==4066 else 10000 if pid==4067 else 2147483647);edges.append((a-1,b-1))
        if pid==4067:assert all(a!=b for a,b in edges) and len(set(tuple(sorted(e)) for e in edges))==m,'at most one road per city pair'
        if pid!=4066:assert connected(n,edges)
        return
    if pid==4069:
        m=n;n=v[1];assert 1<=m<=1000 and 1<=n<=1000 and (len(v)-2)%4==0
        for a,b,c,d in zip(v[2::4],v[3::4],v[4::4],v[5::4]):assert 1<=a<=m and 1<=c<=m and 1<=b<=n and 1<=d<=n and abs(a-c)+abs(b-d)==1
        return
    if pid==4070:
        assert 1<=n<=26 and len(v)==1+6*n
        rect=list(zip(v[1:1+4*n:4],v[2:1+4*n:4],v[3:1+4*n:4],v[4:1+4*n:4]));assert all(a<b and c<d for a,b,c,d in rect)
        points=list(zip(v[1+4*n::2],v[2+4*n::2]));assert all(any(a<=x<=b and c<=y<=d for a,b,c,d in rect) for x,y in points),'each number lies on a slide';return
    raise KeyError(pid)
