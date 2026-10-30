"""Validate maze, graph, and dynamic-programming inputs in chapter 6."""
from collections import deque
import re

def distance(grid,start,end):
    r=len(grid);c=len(grid[0]);q=deque([start]);d={start:0}
    if grid[start[0]][start[1]]=='#':return -1
    while q:
        i,j=q.popleft()
        for x,y in [(i+1,j),(i-1,j),(i,j+1),(i,j-1)]:
            if 0<=x<r and 0<=y<c and grid[x][y]!='#' and (x,y) not in d:d[x,y]=d[i,j]+1;q.append((x,y))
    return d.get(end,-1)

def validate(pid,text):
    assert '\x00' not in text and '\x1a' not in text, 'NUL or DOS EOF byte'
    t=text.split()
    if pid in [3923,3924,3926,3927,3929,3931]:
        i=1 if pid==3931 else 0;count=int(t[0]) if pid==3931 else None;seen=0;ended=False
        if count is not None:assert 1<=count<=10
        while i<len(t):
            L,R,C=map(int,t[i:i+3]) if pid==3923 else (1,*map(int,t[i:i+2]));i+=3 if pid==3923 else 2
            if pid in [3923,3926] and L==(0 if pid==3923 else 1) and R==C==0:ended=True;break
            bound=30 if pid==3923 else 110 if pid==3924 else 20 if pid==3926 else 40 if pid==3927 else 100 if pid==3929 else 200
            assert 1<=L<=30 and (2 if pid==3931 else 1)<=R<=bound and (2 if pid==3931 else 1)<=C<=bound
            grid=t[i:i+L*R];i+=L*R;assert len(grid)==L*R and all(len(s)==C for s in grid), 'compact rectangular grid required'
            alphabet=set('W.') if pid==3924 else set('.#') if pid==3927 else set('.#@*') if pid==3926 else set('.#ST') if pid==3929 else set('.#SE')
            assert all(set(s)<=alphabet for s in grid), 'grid alphabet'
            if pid not in [3924,3927]:
                start,end=('@','*') if pid==3926 else ('S','T') if pid==3929 else ('S','E');assert sum(s.count(start) for s in grid)==sum(s.count(end) for s in grid)==1, 'one start and one target required'
            if pid==3927:assert grid[0][0]==grid[-1][-1]=='.' and distance(grid,(0,0),(R-1,C-1))>=0, 'corner-to-corner route guaranteed'
            if pid==3929:
                s=next((a,b) for a in range(R) for b in range(C) if grid[a][b]=='S');e=next((a,b) for a in range(R) for b in range(C) if grid[a][b]=='T');assert distance(grid,s,e)>=0, 'reachable exit'
            seen+=1
            if pid in [3924,3927,3929]:break
        assert i==len(t) and (seen==count if count is not None else ended if pid in [3923,3926] else seen==1), 'case count, end sentinel, or trailing data'
        return
    if pid in [3940,3951]:
        lines=text.splitlines();assert len(lines)==2, 'two complete input lines required'
        assert all(len(s)<=(1000 if pid==3940 else 1999) for s in lines)
        if pid==3940:assert all(re.fullmatch('[A-Z]*',s) for s in lines)
        else:assert all(not any(ch.isspace() for ch in s) for s in lines)
        return
    if pid==3972:assert t and len(t)%2==0 and all(1<=len(s)<=200 for s in t);return
    if pid==3950:
        assert len(t)==3 and t[0].isdigit() and t[1].isdigit();n,k=map(int,t[:2]);assert 2<=n<=10 and 1<=k<=6 and k<n and len(t[2])==n and t[2].isdigit();return
    assert t and all(re.fullmatch(r'[+-]?\d+',s) for s in t), 'integer tokens expected'
    v=list(map(int,t));n=v[0]
    if pid==3925:
        r,c=v[:2];a=v[2:];assert 1<=r<=50 and 1<=c<=50 and len(a)==r*c and all(0<=x<=15 for x in a)
        for i in range(r):
            for j in range(c):
                x=a[i*c+j]
                if j==0:assert x&1, 'west boundary wall'
                if i==0:assert x&2, 'north boundary wall'
                if j==c-1:assert x&4, 'east boundary wall'
                if i==r-1:assert x&8, 'south boundary wall'
                if j+1<c:assert bool(x&4)==bool(a[i*c+j+1]&1), 'shared east/west walls agree'
                if i+1<r:assert bool(x&8)==bool(a[(i+1)*c+j]&2), 'shared north/south walls agree'
        # A closed wall between any neighboring cells does not alone guarantee two rooms.
        seen=set();rooms=0
        for u in range(r*c):
            if u in seen:continue
            rooms+=1;q=[u];seen.add(u)
            for x in q:
                i,j=divmod(x,c)
                for dr,dc,bit in [(0,-1,1),(-1,0,2),(0,1,4),(1,0,8)]:
                    z=(i+dr)*c+j+dc
                    if not a[x]&bit and z not in seen:seen.add(z);q.append(z)
        assert rooms>=2, 'at least two castle rooms';return
    if pid==3928:assert len(v)==2 and all(0<=x<=100000 for x in v);return
    if pid==3930:
        assert len(v)==25 and set(v)<=set([0,1]) and v[0]==v[-1]==0
        grid=[''.join('#' if x else '.' for x in v[i:i+5]) for i in range(0,25,5)];assert distance(grid,(0,0),(4,4))>=0;return
    if pid==3932:
        assert n>=1 and len(v)==1+5*n
        for i in range(1,len(v),5):L,x,y,a,b=v[i:i+5];assert 4<=L<=300 and all(0<=z<L for z in [x,y,a,b])
        return
    if pid in [3933,3963]:
        assert 1<=n<=(1000 if pid==3933 else 100) and len(v)==1+n*(n+1)//2 and all(0<=x<=(100 if pid==3933 else 2**31-1) for x in v[1:]);return
    if pid==3934:assert 1<=n<=200 and len(v)==n+1 and len(set(v[1:]))==n and all(-2**31<=x<2**31 for x in v[1:]), 'distinct integers required';return
    if pid==3935:assert 1<=len(v)<=1000 and all(1<=x<=30000 for x in v);return
    if pid==3936:
        assert 1<=n<=20 and len(v)==n*n+1 and all(x>=0 for x in v[1:]);a=[v[1+i*n:1+(i+1)*n] for i in range(n)];seen={0};q=[0]
        for u in q:
            for j,cost in enumerate(a[u]):
                if cost>0 and j not in seen:seen.add(j);q.append(j)
        assert n-1 in seen, 'city N reachable from city 1';return
    if pid==3937:
        assert 1<=n<=200 and len(v)>=n+3 and all(x>=0 for x in v[1:n+1]) and (len(v)-n-1)%2==0 and v[-2:]==[0,0]
        assert all(1<=x<y<=n for x,y in zip(v[n+1:-2:2],v[n+2:-2:2])), 'forward mine edges';return
    if pid==3938:
        assert 1<=n<=5000 and len(v)==2*n+1 and all(0<=x<=10000 for x in v[1:]) and len(set(v[1::2]))==len(set(v[2::2]))==n, 'different positions on each river bank';return
    if pid==3939:assert 2<=n<=100 and len(v)==n+1 and all(130<=x<=230 for x in v[1:]);return
    if pid==3941:assert len(v)>=2 and 1<=n<=100 and 1<=v[1]<=100 and len(v)==2+n*v[1] and all(x>=0 for x in v[2:]);return
    if pid in [3942,3943,3945,3947]:
        assert len(v)>=2 and 0<=n<=200 and 1<=v[1]<=30
        width=3 if pid in [3945,3947] else 2;start=3 if pid==3947 else 2;assert len(v)==start+width*v[1]
        assert all(w>0 and value>=0 for w,value in zip(v[start::width],v[start+1::width]))
        if pid==3945:assert all(x>=0 for x in v[start+2::width])
        if pid==3947:assert 1<=v[2]<=10 and all(1<=x<=v[2] for x in v[start+2::width])
        return
    if pid==3944:
        assert len(v)>=2 and 1<=n<=500 and 0<=v[1]<=6000 and len(v)==2+3*n and all(1<=x<=100 and 0<=y<=1000 and 0<=z<=10 for x,y,z in zip(v[2::3],v[3::3],v[4::3]));return
    if pid==3946:
        assert 1<=n<=21 and 1<=v[1]<=79 and 1<=v[2]<=1000 and len(v)==3+3*v[2]
        assert all(1<=x<=21 and 1<=y<=79 and 1<=z<=800 for x,y,z in zip(v[3::3],v[4::3],v[5::3])) and sum(v[3::3])>=n and sum(v[4::3])>=v[1], 'cylinder limits and feasible needs';return
    if pid==3948:assert 1<=n<=20 and 0<=v[1]<=4000 and len(v)==n+2 and all(x>0 for x in v[2:]) and len(set(v[2:]))==n, 'distinct currency denominations';return
    if pid==3949:assert 2<=n<=100 and len(v)==n+1 and all(1<=x<10000 for x in v[1:]);return
    if pid==3952:
        assert 1<=n<=10 and (len(v)-1)%3==0 and v[-3:]==[0,0,0]
        cells=list(zip(v[1:-3:3],v[2:-3:3]));assert all(1<=x<=n and 1<=y<=n for x,y in cells) and len(set(cells))==len(cells) and all(x>0 for x in v[3:-3:3]), 'one positive value per cell and final triple zero';return
    if pid==3953:assert len(v)>=2 and 1<=v[1]<=n<=500 and len(v)==n+2 and all(x>0 for x in v[2:]);return
    if pid==3954:assert 1<=n<=100 and n<=v[1]<=100 and len(v)==2+n*v[1] and all(-50<=x<=50 for x in v[2:]);return
    if pid==3955:assert 1<=n<=100 and 1<=v[1]<=100 and len(v)==2+n*v[1] and all(-2**31<=x<2**31 for x in v[2:]);return
    if pid in [3956,3960]:assert 1<=n<=1000 and len(v)==n+1 and all(-10000<=x<=10000 for x in v[1:]);return
    if pid==3957:assert 1<=n<=100 and len(v)==n*n+1 and all(-127<=x<=127 for x in v[1:]);return
    if pid==3958:assert 2<=n<=1000 and len(v)==n+1;return
    if pid==3959:
        assert 1<=n<=100;i=1
        for _ in range(n):r,c=v[i:i+2];i+=2;assert 1<=r<=100 and 1<=c<=100 and len(v)>=i+r*c and all(0<=x<=1000 for x in v[i:i+r*c]);i+=r*c
        assert i==len(v);return
    if pid==3961:
        assert 1<=n<100;i=1
        for _ in range(n):count=v[i];i+=1;a=v[i:i+count];i+=count;assert 1<=count<100 and len(a)==count and all(0<x<10000 for x in a) and len(set(a))==count, 'distinct heights, fewer than 100 buildings'
        assert i==len(v);return
    if pid==3962:assert 1<=n<100 and len(v)==n*n+1 and all(0<=x<=100 for x in v[1:]);return
    if pid==3964:assert 1<=n<=15 and len(v)==n+1 and all(1<=x<=30000 for x in v[1:]);return
    if pid==3965:assert len(v)>=2 and 1<=n<=1000 and 1<=v[1]<=100 and len(v)==2+2*v[1] and all(1<=x<=100 for x in v[2:]);return
    if pid==3966:assert len(v)>=2 and 1<=n<=20 and 1<=v[1]<=1000 and len(v)==n+2 and all(x>0 for x in v[2:]);return
    if pid==3967:assert 0<n<1000 and 0<v[1]<500 and 0<v[2]<100 and len(v)==3+2*v[2] and all(x>=0 for x in v[3:]);return
    if pid==3968:assert len(v)==1 and 0<=n<=1000;return
    if pid==3969:assert len(v)>=2 and 1<=n<=3500 and 0<=v[1]<=12880 and len(v)==2+2*n and all(w>0 and value>=0 for w,value in zip(v[2::2],v[3::2])), 'exactly N item pairs';return
    if pid==3970:assert len(v)>=2 and 0<=n<=20000 and 1<=v[1]<=30 and len(v)==v[1]+2 and all(1<=x<=10000 for x in v[2:]);return
    if pid==3971:
        assert 1<=n<=1000;i=1
        for _ in range(n):
            count,k=v[i:i+2];i+=2;assert 1<=count<100 and 0<k<1000;a=v[i:i+count];p=v[i+count:i+2*count];i+=2*count
            assert len(a)==len(p)==count and all(0<x<1000000 for x in a) and a==sorted(set(a)) and all(0<x<1000 for x in p), 'restaurant bounds and increasing sites'
        assert i==len(v);return
    raise KeyError(pid)
