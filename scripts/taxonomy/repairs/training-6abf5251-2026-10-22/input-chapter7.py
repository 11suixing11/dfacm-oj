"""Validate chapter 7 input structure, ranges, and graph guarantees."""
from collections import Counter
import re


def connected(n, edges, required=None):
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a,b in edges:
        a,b = find(a),find(b)
        parent[a] = b
    nodes = list(range(n)) if required is None else list(required)
    return not nodes or all(find(x)==find(nodes[0]) for x in nodes)


def validate(pid, text):
    assert '\x00' not in text and '\x1a' not in text, 'NUL or DOS EOF byte'
    t = text.split()
    if pid == 3973:
        assert t and t[0].isdigit() and 1 <= int(t[0]) and len(t)==1+2*int(t[0])
        assert all(1<=len(s)<=1000 for s in t[1:]);return
    if pid in [3982,3983]:
        assert len(t)==2 and all(re.fullmatch(r'[1-9][0-9]*',s) and len(s)<(100 if pid==3982 else 300) for s in t), 'positive high-precision integer length';return
    if pid == 3984:
        assert len(t)==2 and int(t[0]) in [3,4,5,6,7,8,9,10,16], 'allowed radix 3..10 or 16'
        assert t[1] and t[1][0]!='0' and len(t[1])<=100
        alphabet = '0123456789ABCDEF'[:int(t[0])]
        assert all(x in alphabet for x in t[1].upper()), 'each input digit must be smaller than radix';return
    if pid in [4004,4010]:
        assert len(t)>=3;n,m = map(int,t[:2]);assert 1<=n<=100 and 1<=m<=100
        if pid==4004:assert len(t)==n+2 and all(len(s)==m and s.isdigit() for s in t[2:]), 'one compact digit row per grid row'
        else:assert len(t)==2+n*m and all(s in ['0','1'] for s in t[2:]), 'n rows of m space-separated zero/one integers'
        return
    if pid == 4006:
        assert len(text.strip())<250 and text.strip().count('@')==1 and text.strip().endswith('@')
        assert re.fullmatch(r'[0-9+*/\s-]+@',text.strip())
        tokens = re.findall(r'\d+|[+*/-]',text.strip()[:-1]);stack = []
        for token in tokens:
            if token.isdigit():stack.append(int(token))
            else:
                assert len(stack)>=2,'valid postfix arity';b,a = stack.pop(),stack.pop()
                if token=='+':x = a+b
                elif token=='-':x = a-b
                elif token=='*':x = a*b
                else:assert b and a%b==0,'nonzero exact division';x = a//b
                stack.append(x)
            assert abs(stack[-1])<=2**64,'operand and result absolute bound'
        assert len(stack)==1;return
    if pid == 4012:
        assert len(text.encode('utf-8'))<=32768 and t and all(re.fullmatch(r'[A-Z]{1,63}',s) for s in t)
        assert all(len(s.split())==1 for s in text.splitlines()),'one word per line';return
    if pid == 4014:
        assert len(t)==2 and all(re.fullmatch(r'[a-z]{1,26}',s) and len(set(s))==len(s) for s in t) and set(t[0])==set(t[1]), 'unique node labels in both traversals'
        def visit(pre,inside):
            if not pre:assert not inside;return
            assert len(pre)==len(inside) and pre[0] in inside;k = inside.index(pre[0]);visit(pre[1:k+1],inside[:k]);visit(pre[k+1:],inside[k+1:])
        visit(*t);return
    if pid == 4015:
        assert len(t)==1 and re.fullmatch('[A-Z.]+',t[0]) and len(set(t[0].replace('.','')))==len(t[0].replace('.',''))
        slots = 1
        for ch in t[0]:assert slots>0,'complete extended traversal';slots += -1 if ch=='.' else 1
        assert slots==0;return
    if pid == 4018:
        assert t;n = int(t[0]);assert 2<=n<=150 and len(t)==1+3*n
        coordinates = list(zip(map(int,t[1:2*n+1:2]),map(int,t[2:2*n+1:2])))
        assert len(set(coordinates))==n and all(0<=x<=100000 and 0<=y<=100000 for x,y in coordinates)
        matrix = t[2*n+1:];assert len(matrix)==n and all(len(s)==n and set(s)<=set('01') for s in matrix)
        assert all(matrix[i][i]=='0' and all(matrix[i][j]==matrix[j][i] for j in range(n)) for i in range(n)), 'symmetric simple adjacency matrix'
        edges = [(i,j) for i in range(n) for j in range(i) if matrix[i][j]=='1']
        assert not connected(n,edges),'at least two disconnected pastures';return
    if pid == 4022:
        assert len(t)>=2;n,m = map(int,t[:2]);assert 1<=n<=200 and 0<=m<=2*n*(n-1) and len(t)==2+3*m
        edges = []
        for a,b,kind in zip(t[2::3],t[3::3],t[4::3]):
            x,y = int(a),int(b);assert kind in ['D','R'] and 1<=x<=n and 1<=y<=n
            assert (x<n if kind=='D' else y<n), 'drawn edge must stay inside n by n point grid'
            edges.append((x,y,kind))
        assert len(set(edges))==m,'no duplicate edges';return
    assert t and all(re.fullmatch(r'[+-]?\d+',s) for s in t),'integer tokens'
    v = list(map(int,t));n = v[0]
    if pid == 3974:assert 1<=n<=100 and 1<=v[1]<=100 and len(v)==n+2 and all(1<=x<=1000000 for x in v[2:]);return
    if pid == 3975:assert len(v)%2==0 and all(1<=a<=100 and 1<=b<=10 for a,b in zip(v[::2],v[1::2]));return
    if pid in [3976,3977,3980]:
        assert 1<=n<=(20 if pid==3980 else 50);i = 1
        for _ in range(n):
            assert i<len(v);length = v[i];assert (2 if pid==3980 else 1)<=length<=100000 and i+length<len(v);a = v[i+1:i+length+1]
            assert all(1<=x<=1000 for x in a) if pid==3976 else all(abs(x)<=(10000 if pid==3980 else 1000000) for x in a)
            i += length+1
        assert i==len(v),'case count and trailing tokens';return
    if pid == 3978:assert 0<=n<=20 and len(v)==1+2*n and all(1<=x<=10 for x in v[1:]);return
    if pid == 3979:assert len(v)==2 and 6<n<=200 and 2<=v[1]<=6;return
    if pid == 3981:
        assert 1<=n<=500 and len(v)>n+1;m = v[n+1];assert 1<=m<=500 and len(v)==n+m+2 and all(-2**31<=x<2**31 for x in v[1:n+1]+v[n+2:]);return
    if pid in [3985,3986,4003]:
        assert 1<=n<=(100000 if pid==3986 else 10000) and len(v)==n+1
        if pid==3985:assert len(set(v[1:]))==n,'distinct carriage numbers'
        if pid==3986:assert all(1<=x<=100000 for x in v[1:])
        assert all(-2**31<=x<2**31 for x in v[1:]);return
    if pid == 3987:assert len(v)==3 and 0<=n<=20 and 1<=v[1]<=20 and n<=v[2]<=50;return
    if pid == 3988:assert len(v)==1 and 1<=n<=1000;return
    if pid == 3989:
        assert len(v)==4 and 0<=n<=20 and 0<=v[1]<=20 and 0<=v[2]<=n and 0<=v[3]<=v[1] and tuple(v[2:]) not in [(0,0),tuple(v[:2])];return
    if pid == 3990:assert len(v)==2 and 1<=v[1]<=n<30;return
    if pid == 3991:assert len(v)==1 and 0<=n<=1000;return
    if pid == 3992:assert len(v)==2 and 1<n<21 and 1<=v[1]<=n;return
    if pid == 3993:assert len(v)==1 and 2<=n<=30;return
    if pid == 3994:assert 1<=n<=1000 and len(v)==n+1 and all(0<=x<=2**31-1 for x in v[1:]);return
    if pid == 3995:assert 1<=n<=100 and len(v)==n+1 and all(1<=x<=10000 for x in v[1:]) and sum(v[1:])%n==0,'card total divisible by pile count';return
    if pid == 3996:assert len(t)==2 and re.fullmatch('[1-9][0-9]{0,239}',t[0]) and 0<=v[1]<len(t[0]);return
    if pid == 3997:assert 1<=len(v)<=1000 and all(1<=x<=30000 for x in v);return
    if pid in [3998,3999]:
        assert 1<=n<=(1000 if pid==3998 else 10000) and len(v)==2*n+1
        assert all(0<=a<b<=32767 for a,b in zip(v[1::2],v[2::2])) if pid==3998 else all(0<=a<=b<=10000 for a,b in zip(v[1::2],v[2::2]));return
    if pid == 4000:assert len(v)==1 and 1<=n<=10;return
    if pid == 4001:assert len(v)==3 and 0<=n<=2**31-1 and 0<=v[1]<=2**31-1 and 1<=v[2]<=46340;return
    if pid == 4002:assert len(v)==1 and 4<=n<=1000;return
    if pid == 4005:assert len(v)==4 and all(1<=x<=100 for x in v);return
    if pid == 4007:assert len(v)==3 and 1<=n<=100000 and 1<=v[1]<=100000 and 0<=v[2]<=100000;return
    if pid == 4008:assert len(v)%2==0 and all(1<=a<=50 and 1<=b<=1000000 for a,b in zip(v[::2],v[1::2]));return
    if pid == 4009:assert len(v)==2 and 1<=n<=100 and 1<=v[1]<=2**63-1;return
    if pid == 4011:
        m = v[1];assert 1<=n<=100 and m==n-1 and len(v)==2+2*m
        if n==1:return
        edges = list(zip(v[2::2],v[3::2]));nodes = {x for edge in edges for x in edge};children = Counter(b for a,b in edges)
        assert len(nodes)==n and all(1<=x<=1000 for x in nodes) and all(x==1 for x in children.values()) and len(children)==n-1
        ranks = {x:i for i,x in enumerate(nodes)};assert connected(n,[(ranks[a],ranks[b]) for a,b in edges]),'one rooted tree';return
    if pid == 4013:
        assert 1<=n<=100 and len(v)==1+3*n;edges = []
        for i in range(n):
            population,a,b = v[1+3*i:4+3*i];assert 0<=population<=2**31-1 and 0<=a<=n and 0<=b<=n
            for j in [a,b]:
                if j:assert j!=i+1;edges.append((i,j-1))
        assert len(edges)==n-1 and connected(n,edges) and len({b for a,b in edges})==n-1,'valid binary tree';return
    if pid == 4016:
        m = v[1];assert 1<n<100 and 1<m<2000 and len(v)==2+2*m;edges = list(zip(v[2::2],v[3::2]))
        assert all(1<=a<=n and 1<=b<=n and a!=b for a,b in edges)
        degree = Counter(x for e in edges for x in e);assert sum(x%2 for x in degree.values()) in [0,2] and connected(n,[(a-1,b-1) for a,b in edges],{x-1 for x in degree}), 'nonisolated vertices connected and Euler trail exists';return
    if pid == 4017:
        assert 1<=n<=100 and len(v)>=2*n+4 and all(-10000<=x<=10000 for x in v[1:2*n+1]);m = v[2*n+1]
        assert 0<=m<=10000 and len(v)==2*n+4+2*m;edges = list(zip(v[2*n+2:2*n+2+2*m:2],v[2*n+3:2*n+2+2*m:2]))
        assert all(1<=a<=n and 1<=b<=n for a,b in edges) and all(1<=x<=n for x in v[-2:])
        assert connected(n,[(a-1,b-1) for a,b in edges],{v[-2]-1,v[-1]-1}),'source and target connected';return
    if pid == 4019:
        m = v[1];assert 1<=n<=2000 and 1<=m<=100000 and len(v)==3*m+4;edges = []
        for a,b,z in zip(v[2:-2:3],v[3:-2:3],v[4:-2:3]):assert 1<=a<=n and 1<=b<=n and 1<=z<100;edges.append((a-1,b-1))
        assert all(1<=x<=n for x in v[-2:]) and connected(n,edges,{v[-2]-1,v[-1]-1});return
    if pid == 4020:
        p,m = v[1:3];assert 1<=n<=500 and 2<=p<=800 and 1<=m<=1450 and len(v)==3+n+3*m and all(1<=x<=p for x in v[3:3+n]);edges = []
        for a,b,w in zip(v[3+n::3],v[4+n::3],v[5+n::3]):assert 1<=a<=p and 1<=b<=p and 1<=w<=255;edges.append((a-1,b-1))
        assert connected(p,edges,{x-1 for x in v[3:3+n]}),'all cows can reach a common pasture';return
    if pid == 4021:
        m = v[1];assert 1<=n<=20000 and 1<=m<=1000000 and len(v)>2*m+2;q = v[2+2*m]
        assert 1<=q<=1000000 and len(v)==3+2*m+2*q and all(1<=x<=n for x in v[2:2+2*m]+v[3+2*m:]);return
    raise ValueError(pid)
