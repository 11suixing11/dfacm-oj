"""Independent validators and algorithms for orders 35 onward."""
from functools import lru_cache
from itertools import combinations
from math import comb
from bisect import bisect_left
from array import array
from collections import deque
import re

def passing(text):
    tokens=list(map(int,text.split()));assert len(tokens)==2
    n,m=tokens;assert 3<=n<=30 and 1<=m<=30
    # A return occurs exactly when (#right - #left) is divisible by n.
    return str(sum(comb(m,right) for right in range(m+1) if (2*right-m)%n==0))
def herb_input(text):
    tokens=list(map(int,text.split()));assert len(tokens)>=2
    total,count=tokens[:2];assert 1<=total<=1000 and 1<=count<=100 and len(tokens)==2+2*count
    values=[tuple(tokens[i:i+2]) for i in range(2,len(tokens),2)];assert all(1<=t<=100 and 1<=v<=100 for t,v in values)
    return total,values
def herbs(text):
    total,values=herb_input(text)
    # Index by collected value and minimize time; C++ indexes by time.
    max_value=sum(v for _,v in values);dp=[total+1]*(max_value+1);dp[0]=0;largest=0
    for cost,value in values:
        for old in range(largest,-1,-1):dp[old+value]=min(dp[old+value],dp[old]+cost)
        largest+=value
    return str(max(i for i,t in enumerate(dp) if t<=total))
def amicable(text):
    tokens=list(map(int,text.split()));assert len(tokens)==2 and all(1<=v<10000 for v in tokens)
    # Sum directly to validate the trial-divisor pairs in the reference.
    a,b=tokens
    return 'yes' if sum(d for d in range(1,a) if a%d==0)==b and sum(d for d in range(1,b) if b%d==0)==a else 'no'
def notes_input(text,require_solvable=False):
    tokens=list(map(int,text.split()));assert len(tokens)>=2
    m,n=tokens[:2];assert 1<=m<=50 and 1<=n<=50 and len(tokens)==2+m*n
    cells=tokens[2:];assert all(0<=v<=100 for v in cells) and cells[0]==cells[-1]==0
    if require_solvable:assert m>=2 and n>=2,'no two disjoint routes'
    return m,n,[cells[i*n:(i+1)*n] for i in range(m)]
def notes_paths(text):
    m,n,a=notes_input(text)
    @lru_cache(None)
    def paths(x,y):
        if x==m-1 and y==n-1:return [(frozenset(),0)]
        result=[]
        for dx,dy in [(0,1),(1,0)]:
            nx,ny=x+dx,y+dy
            if nx>=m or ny>=n:continue
            for cells,value in paths(nx,ny):
                c=() if (nx==m-1 and ny==n-1) else ((nx,ny),)
                result.append((cells.union(c),value+a[nx][ny]))
        return result
    possibilities=paths(0,0)
    return max((v1+v2 for p1,v1 in possibilities for p2,v2 in possibilities if p1.isdisjoint(p2)),default=None)

def notes(text):
    m,n,a=notes_input(text,True);size=2*m*n;graph=[[] for _ in range(size)]
    def edge(u,v,capacity,cost):
        graph[u].append([v,capacity,cost,len(graph[v])]);graph[v].append([u,0,-cost,len(graph[u])-1])
    for x in range(m):
        for y in range(n):
            cell=x*n+y;endpoint=cell in [0,m*n-1]
            edge(2*cell,2*cell+1,2 if endpoint else 1,-a[x][y])
            for dx,dy in [(0,1),(1,0)]:
                nx,ny=x+dx,y+dy
                if nx<m and ny<n:edge(2*cell+1,2*(nx*n+ny),2,0)
    source,sink=0,size-1;total=0
    for _ in range(2):
        dist=[10**9]*size;dist[source]=0;parent=[None]*size;active=[False]*size;queue=deque([source]);active[source]=True
        while queue:
            u=queue.popleft();active[u]=False
            for i,(v,cap,cost,rev) in enumerate(graph[u]):
                if cap and dist[u]+cost<dist[v]:
                    dist[v]=dist[u]+cost;parent[v]=(u,i)
                    if not active[v]:queue.append(v);active[v]=True
        assert parent[sink] is not None,'no two vertex-disjoint routes'
        total+=dist[sink];v=sink
        while v!=source:
            u,i=parent[v];entry=graph[u][i];entry[1]-=1;graph[v][entry[3]][1]+=1;v=u
    return str(-total)

def meetings_input(text):
    tokens=list(map(int,text.split()));assert tokens
    n=tokens[0];assert 1<=n<=200000 and len(tokens)==1+2*n
    values=[tuple(tokens[i:i+2]) for i in range(1,len(tokens),2)]
    assert all(1<=a<=b<=10**9 for a,b in values)
    return values
def meetings_brute(text):
    rows=meetings_input(text);assert len(rows)<=20;best=[]
    def visit(at,selected):
        nonlocal best
        if len(selected)+len(rows)-at<len(best):return
        if at==len(rows):
            ids=[i+1 for i in selected]
            if len(ids)>len(best) or (len(ids)==len(best) and ids<best):best=ids
            return
        left,right=rows[at]
        if all(right<rows[i][0] or rows[i][1]<left for i in selected):visit(at+1,selected+[at])
        visit(at+1,selected)
    visit(0,[])
    return str(len(best))+'\n'+' '.join(map(str,best))
def meetings(text):
    # Independent weighted interval DP sorted by finish time. Persistent
    # bitsets choose the lexicographically smallest ID set among equal counts.
    rows=meetings_input(text);n=len(rows);ordered=sorted((b,a,i) for i,(a,b) in enumerate(rows));ends=[b for b,a,i in ordered]
    size=1
    while size<n:size*=2
    left=array('i',[0,0]);right=array('i',[0,0])
    def add(node,lo,hi,position):
        if hi-lo==1:return 1
        mid=(lo+hi)//2;l,r=left[node],right[node]
        if position<mid:l=add(l,lo,mid,position)
        else:r=add(r,mid,hi,position)
        left.append(l);right.append(r);return len(left)-1
    def first_difference(a,b,lo,hi):
        if a==b:return None
        if hi-lo==1:return lo,bool(a)
        mid=(lo+hi)//2
        diff=first_difference(left[a],left[b],lo,mid)
        return diff if diff is not None else first_difference(right[a],right[b],mid,hi)
    roots=[0];counts=[0]
    for finish,start,identifier in ordered:
        prev=bisect_left(ends,start);candidate_count=counts[prev]+1
        take=candidate_count>counts[-1]
        if candidate_count==counts[-1]:
            diff=first_difference(roots[prev],roots[-1],0,size)
            take=diff is None or identifier<diff[0] or diff[1]
        if take:roots.append(add(roots[prev],0,size,identifier));counts.append(candidate_count)
        else:roots.append(roots[-1]);counts.append(counts[-1])
    ids=[];stack=[(roots[-1],0,size)]
    while stack:
        node,lo,hi=stack.pop()
        if not node:continue
        if hi-lo==1:ids.append(lo+1);continue
        mid=(lo+hi)//2;stack.extend([(right[node],mid,hi),(left[node],lo,mid)])
    assert len(ids)==counts[-1]
    return str(len(ids))+'\n'+' '.join(map(str,ids))

class ParseExpression:
    def __init__(self,text):self.text=text;self.pos=0
    def atom(self):
        assert self.pos<len(self.text)
        c=self.text[self.pos];self.pos+=1
        if c=='(':
            node=self.expr();assert self.pos<len(self.text) and self.text[self.pos]==')';self.pos+=1;return node
        assert 'a'<=c<='z';return c
    def term(self):
        node=self.atom()
        while self.pos<len(self.text) and self.text[self.pos] in '*/':
            op=self.text[self.pos];self.pos+=1;node=(op,node,self.atom())
        return node
    def expr(self):
        node=self.term()
        while self.pos<len(self.text) and self.text[self.pos] in '+-':
            op=self.text[self.pos];self.pos+=1;node=(op,node,self.term())
        return node
def bracket_input(text):
    tokens=text.split();assert len(tokens)==1 and 1<=len(tokens[0])<=255
    parser=ParseExpression(tokens[0]);node=parser.expr();assert parser.pos==len(parser.text)
    return node
def bracket_output(node,parent=None,right=False):
    if isinstance(node,str):return node
    op,left,child=node;out=bracket_output(left,op,False)+op+bracket_output(child,op,True)
    precedence=lambda x:1 if x in '+-' else 2
    need=parent and (precedence(op)<precedence(parent) or (right and ((parent=='-' and precedence(op)==1) or (parent=='/' and precedence(op)==2))))
    return '('+out+')' if need else out
def brackets(text):return bracket_output(bracket_input(text))
def dragon_input(text):
    tokens=text.split();n=int(tokens[0]);assert 1<=n<=20 and len(tokens)==n+2
    words=tokens[1:-1];start=tokens[-1]
    assert all(re.fullmatch('[a-zA-Z]+',w) for w in words) and re.fullmatch('[a-zA-Z]',start) and any(w.startswith(start) for w in words)
    return words,start
def dragon(text):
    # Group interchangeable words, then memoize the remaining occurrence count.
    words,start=dragon_input(text);group=sorted(set(words));caps=tuple(2*words.count(w) for w in group)
    adjacent=[[] for _ in group]
    for i,a in enumerate(group):
        for j,b in enumerate(group):
            for overlap in range(1,min(len(a),len(b))):
                if a[-overlap:]==b[:overlap]:adjacent[i].append((j,len(b)-overlap));break
    @lru_cache(None)
    def dfs(last,remaining):
        best=0
        for dest,value in adjacent[last]:
            if remaining[dest]:
                new=list(remaining);new[dest]-=1;best=max(best,value+dfs(dest,tuple(new)))
        return best
    best=0
    for i,w in enumerate(group):
        if w.startswith(start):
            new=list(caps);new[i]-=1;best=max(best,len(w)+dfs(i,tuple(new)))
    return str(best)
def solve(pid,text):
    if pid==4253:return meetings(text)
    if pid==4254:return passing(text)
    if pid==4255:return notes(text)
    if pid==4256:return herbs(text)
    if pid==4257:return brackets(text)
    if pid==4258:return dragon(text)
    if pid==4259:return amicable(text)
    raise ValueError(pid)
