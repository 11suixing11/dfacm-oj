"""Generate complete samples and oracle-checked data for the remaining local problems."""
from pathlib import Path
from collections import Counter, deque
from decimal import Decimal, localcontext
import base64
import hashlib
import gzip
import heapq
import itertools
import json
import math
import random
import re
import subprocess
import sys

from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
QA = ROOT / 'qa'
STAGE = QA / 'problem-tests-20261022'
SEED = 20261022
RNG = random.Random(SEED)
SUMMARY = {'seed': SEED, 'oracleChecks': {}, 'legacyChecks': {}, 'cases': {}}


def sha(data):
    return hashlib.sha256(data.encode('utf-8') if isinstance(data, str) else data).hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def snapshot(doc_id):
    return json.loads((QA / f'problem-current-system-{doc_id}.json').read_text(encoding='utf-8'))


def legacy_files(row):
    return {file['name']: base64.b64decode(file['rawBase64']) for file in row['files']}


def output_lines(values):
    return ''.join(str(value) + '\n' for value in values)


def graph_oracle(text):
    values = list(map(int, text.split()))
    n, q = values[:2]
    edges = [values[2+3*i:5+3*i] for i in range(2*n-2)]
    offset = 2 + 3*(2*n-2)
    adjacency = [[] for _ in range(n)]
    for i, (a,b,w) in enumerate(edges):
        adjacency[a-1].append(i)
    answer = []
    for i in range(q):
        kind,a,b = values[offset+3*i:offset+3*i+3]
        if kind == 1:
            assert 1 <= a <= len(edges) and 1 <= b <= 10**6
            edges[a-1][2] = b
        else:
            distance = [10**30] * n
            distance[a-1] = 0
            todo = [(0, a-1)]
            while todo:
                d,u = heapq.heappop(todo)
                if d != distance[u]:
                    continue
                if u == b-1:
                    break
                for e in adjacency[u]:
                    _,v,w = edges[e]
                    if d+w < distance[v-1]:
                        distance[v-1] = d+w
                        heapq.heappush(todo, (d+w, v-1))
            answer.append(distance[b-1])
    assert len(values) == offset+3*q
    return output_lines(answer)


def graph_input(n, edges, queries):
    assert len(edges) == 2*n-2 and 2 <= len(queries) <= 200000
    return f'{n} {len(queries)}\n' + ''.join(' '.join(map(str,row))+'\n' for row in edges+queries)


def blocks_brute(text):
    lines = text.splitlines()
    n,m = map(int,lines[0].split())
    grid = lines[1:]
    assert len(grid)==n and all(len(row)==m and set(row)<=set('01') for row in grid)
    best = sum(row.count('1') for row in grid)
    # k > max(n,m) is one block and cannot beat making the whole image zero.
    for k in range(2,max(n,m)+1):
        cost = 0
        for r in range(0,n,k):
            for c in range(0,m,k):
                ones = sum(grid[y][x]=='1' for y in range(r,min(n,r+k)) for x in range(c,min(m,c+k)))
                cost += min(ones,k*k-ones)
        best = min(best,cost)
    return f'{best}\n'


def blocks_pattern(n,m):
    grid = [('01'*((m+1)//2))[:m] if i%2==0 else ('10'*((m+1)//2))[:m] for i in range(n)]
    best = n*m//2
    def ones(h,w,parity):
        return (h*w + ((1 if parity else -1) if h%2 and w%2 else 0))//2
    for k in range(2,max(n,m)+1):
        nr,nc = n//k,m//k
        hr,wr = n%k,m%k
        cost = nr*nc*(k*k//2)
        if wr:
            for r in range(nr):
                x = ones(k,wr,(r*k+nc*k)%2)
                cost += min(x,k*k-x)
        if hr:
            for c in range(nc):
                x = ones(hr,k,(nr*k+c*k)%2)
                cost += min(x,k*k-x)
        if hr and wr:
            x = ones(hr,wr,(nr*k+nc*k)%2)
            cost += min(x,k*k-x)
        best = min(best,cost)
    return f'{n} {m}\n'+'\n'.join(grid)+'\n',f'{best}\n'


def xor_oracle(text):
    rows = text.splitlines()
    q = int(rows[0])
    assert len(rows)==q+1 and 1<=q<=100000
    present = Counter()
    answers = []
    for row in rows[1:]:
        values = list(map(int,row.split()))
        kind,p = values[:2]
        assert 1<=p<=10**8
        if kind==1:
            present[p]+=1
        elif kind==2:
            assert present[p]>0
            present[p]-=1
            if not present[p]:
                del present[p]
        else:
            limit = values[2]
            assert 1<=limit<=10**8
            answers.append(sum(count for value,count in present.items() if (value^p)<limit))
    assert answers
    return output_lines(answers)


def xor_input(events):
    return str(len(events))+'\n'+''.join(' '.join(map(str,event))+'\n' for event in events)


def dungeon_oracle(text):
    tokens = text.split()
    at = 0
    answers = []
    while True:
        l,r,c = map(int,tokens[at:at+3]); at+=3
        if l==r==c==0:
            break
        assert 1<=l<=30 and 1<=r<=30 and 1<=c<=30
        rows = tokens[at:at+l*r]; at+=l*r
        assert len(rows)==l*r and all(len(row)==c for row in rows)
        cells = ''.join(rows)
        assert cells.count('S')==cells.count('E')==1
        start,end = cells.index('S'),cells.index('E')
        distances = {start:0}
        todo=deque([start])
        while todo:
            u=todo.popleft()
            x=u%c; y=u//c%r; z=u//c//r
            for dz,dy,dx in [(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]:
                zz,yy,xx=z+dz,y+dy,x+dx
                if not(0<=zz<l and 0<=yy<r and 0<=xx<c):
                    continue
                v=(zz*r+yy)*c+xx
                if cells[v]!='#' and v not in distances:
                    distances[v]=distances[u]+1
                    todo.append(v)
        answers.append(f'Escaped in {distances[end]} minute(s).' if end in distances else 'Trapped!')
    assert at==len(tokens)
    return output_lines(answers)


def dungeon_input(mazes):
    out=[]
    for maze in mazes:
        l,r,c=len(maze),len(maze[0]),len(maze[0][0])
        out.append(f'{l} {r} {c}\n')
        for layer in maze:
            out.append('\n'.join(layer)+'\n\n')
    return ''.join(out)+'0 0 0\n'


def order_oracle(text):
    words=text.split(); at=1; answers=[]
    for _ in range(int(words[0])):
        n=int(words[at]); at+=1
        edges=set(tuple(words[at+2*i:at+2*i+2]) for i in range(n)); at+=2*n
        names=set(itertools.chain.from_iterable(edges))
        ordered=[]
        while names:
            possible=sorted(name for name in names if not any(b==name and a in names for a,b in edges))
            assert len(possible)==1, ('Order must be uniquely determined',possible)
            ordered.append(possible[0]); names.remove(possible[0])
        answers.append(' '.join(ordered))
    assert at==len(words)
    return output_lines(answers)


def order_input(groups):
    return str(len(groups))+'\n'+''.join(str(len(edges))+'\n'+''.join(a+' '+b+'\n' for a,b in edges) for edges in groups)


def maxsum_oracle(text):
    values=list(map(int,text.split())); n=values[0]; a=values[1:]
    assert len(a)==n and 1<=n<=100000 and all(abs(x)<=10000 for x in a)
    prefix=0; smallest=0; answer=-10**30
    for x in a:
        prefix+=x
        answer=max(answer,prefix-smallest)
        smallest=min(smallest,prefix)
    return f'{answer}\n'


def scalar_oracle(text):
    values=list(map(int,text.split())); at=1; answers=[]
    for _ in range(values[0]):
        n=values[at]; at+=1
        a=values[at:at+n]; at+=n
        b=values[at:at+n]; at+=n
        assert len(a)==len(b)==n and 1<=n<=1000 and all(abs(x)<=1000 for x in a+b)
        value=sum(x*y for x,y in zip(sorted(a),sorted(b,reverse=True)))
        if n<=7:
            assert value==min(sum(x*y for x,y in zip(a,p)) for p in itertools.permutations(b))
        answers.append(value)
    assert at==len(values) and 1<=values[0]<=10
    return output_lines(answers)


def scalar_input(groups):
    return str(len(groups))+'\n'+''.join(str(len(a))+'\n'+' '.join(map(str,a))+'\n'+' '.join(map(str,b))+'\n' for a,b in groups)


CUBE_FACES=[{1,2,3,4},{9,10,11,12},{1,5,8,9},{2,7,8,10},{3,6,7,11},{4,5,6,12}]
CUBE_EDGES=[(0,1),(1,2),(2,3),(3,0),(0,4),(3,7),(2,6),(1,5),(4,5),(5,6),(6,7),(7,4)]


def cube_dual(cuts):
    reached={0}; todo=[0]
    while todo:
        u=todo.pop()
        for v in range(6):
            if v not in reached and CUBE_FACES[u]&CUBE_FACES[v]-cuts:
                reached.add(v); todo.append(v)
    return len(reached)<6


def cube_primal(cuts):
    parent=list(range(8))
    def find(u):
        while parent[u]!=u:
            u=parent[u]
        return u
    for edge in cuts:
        a,b=CUBE_EDGES[edge-1]
        aa,bb=find(a),find(b)
        if aa==bb:
            return True
        parent[aa]=bb
    return False


def cube_input(groups):
    return str(len(groups))+'\n'+''.join(str(len(cuts))+'\n'+' '.join(map(str,cuts))+'\n' for cuts in groups)


def cube_oracle(text):
    values=list(map(int,text.split())); at=1; answer=[]
    for _ in range(values[0]):
        n=values[at]; at+=1; cuts=values[at:at+n]; at+=n
        assert len(cuts)==n and len(set(cuts))==n and all(1<=v<=12 for v in cuts)
        assert cube_dual(set(cuts))==cube_primal(set(cuts))
        answer.append('Yes' if cube_dual(set(cuts)) else 'No')
    assert at==len(values)
    return output_lines(answer)


def time_oracle(text):
    values=list(map(int,text.split())); t=values[0]; seconds=values[1:]
    assert 1<=t<=100000 and len(seconds)==t and all(0<=x<86400 for x in seconds)
    from datetime import datetime,timedelta
    return ''.join((datetime(2000,1,1)+timedelta(seconds=x)).strftime('%H:%M:%S')+'\n' for x in seconds)


def matrix_oracle(text):
    values=list(map(int,text.split())); n,m=values[:2]; a=values[2:2+n*m]; b=values[2+n*m:]
    assert 1<=n<=100 and 1<=m<=100 and len(a)==len(b)==n*m and all(abs(x)<=1000 for x in a+b)
    return ''.join(' '.join(str(a[i*m+j]+b[i*m+j]) for j in range(m))+'\n' for i in range(n))


def matrix_input(a,b):
    return f'{len(a)} {len(a[0])}\n'+''.join(' '.join(map(str,row))+'\n' for row in a+b)


def bees_oracle(text):
    values=list(map(int,text.split())); n=values[0]
    assert n>=1 and len(values)==1+7*n+6
    initial=values[-6:]; p=list(initial[:3]); q=list(initial[3:])
    for i in range(n):
        a,b,c,d,e,f,t=values[1+7*i:8+7*i]
        for j,speed in enumerate([a,b,c]): p[j]+=speed*t
        for j,speed in enumerate([d,e,f]): q[j]+=speed*t
    with localcontext() as ctx:
        ctx.prec=60
        distance=Decimal(sum((x-y)**2 for x,y in zip(p,q))).sqrt()
        return str(distance.quantize(Decimal('0.0001')))+'\n'


def bees_input(events,initial):
    return str(len(events))+'\n'+''.join(' '.join(map(str,row))+'\n' for row in events)+' '.join(map(str,initial))+'\n'


def harmonic_oracle(text):
    answer=[]; ended=False
    with localcontext() as ctx:
        ctx.prec=60
        for value in text.split():
            x=Decimal(value)
            if x==0:
                ended=True; break
            assert Decimal('0.01')<=x<=Decimal('5.20')
            n=0; total=Decimal(0)
            while total<x:
                n+=1; total+=Decimal(1)/Decimal(n+1)
            answer.append(f'{n} card(s)')
    assert ended
    return output_lines(answer)


def replace_samples(row,inp,out):
    from html import escape
    body=row['content']
    pattern=r'(<code\b[^>]*class="language-(input|output)1"[^>]*>)([\s\S]*?)(</code>)'
    def replace(match):
        value=inp if match[2]=='input' else out
        return match[1]+escape(value.rstrip('\n'),quote=False)+match[4]
    body,count=re.subn(pattern,replace,body)
    assert count==2,(row['docId'],count)
    body=body.replace('注：样例因数据量较大已截断，完整数据以实际测试点为准。','')
    body=re.sub(r'<h2>说明/提示</h2>\s*(?=<h2>|$)','',body)
    return body


def cf_statement(row):
    soup=BeautifulSoup(row['content'],'lxml')
    old=legacy_files(row)
    for element in soup.select('.sample-tests'):
        markup='<h2>Example</h2><pre><code class="language-input1">'+old['1.in'].decode().rstrip('\n')+'</code></pre><pre><code class="language-output1">'+old['1.out'].decode().rstrip('\n')+'</code></pre>'
        element.replace_with(BeautifulSoup(markup,'html.parser'))
    for code in list(soup.select('pre code')):
        if not code.get_text().strip():
            code.parent.decompose()
    if row['docId']==986:
        replacements={
            'file://SAeJsZIzpng':'<span class="tex-span"><i>p</i><sub>i</sub> &#8853; <i>p</i><sub>j</sub> &lt; <i>l</i><sub>j</sub></span>',
            'file://5yn6x3Ttpng':'<span class="tex-span"><i>x</i> &#8853; <i>y</i></span>',
            'file://vP2wvKwGpng':'<span class="tex-span">4 &#8853; 6 = 2</span>',
            'file://J8PAwVgepng':'<span class="tex-span">3 &#8853; 6 = 5</span>',
        }
        for image in soup.select('img'):
            src=image.get('src')
            if src in replacements:
                image.replace_with(BeautifulSoup(replacements[src],'html.parser'))
    for header in soup.select('.problem-statement > .header'):
        header.decompose()
    body=soup.body or soup
    return ''.join(str(child) for child in body.contents)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    STAGE.mkdir(exist_ok=True)
    ids=[917,918,986,3923,4129,4159,4161,4189,4207,4218,4303,4310,4312]
    executables={}
    for doc_id in ids:
        executable=STAGE/f'reference-{doc_id}.exe'
        source=HERE/f'reference-{doc_id}.cpp'
        if not executable.exists() or executable.stat().st_mtime<source.stat().st_mtime:
            compiled=subprocess.run(['C:/msys64/ucrt64/bin/g++.exe','-std=c++17','-O2',str(source),'-o',str(executable)],capture_output=True,timeout=50)
            if compiled.returncode:
                raise RuntimeError(compiled.stderr.decode(errors='replace'))
        executables[doc_id]=executable

    def verify(doc_id,inp,expected,label):
        inp=inp.encode() if isinstance(inp,str) else inp
        expected=expected.encode() if isinstance(expected,str) else expected
        run=subprocess.run([str(executables[doc_id])],input=inp,capture_output=True,timeout=20)
        assert run.returncode==0,(doc_id,label,run.stderr)
        assert run.stdout.split()==expected.split(),(doc_id,label,run.stdout[:500],expected[:500])
        SUMMARY['oracleChecks'][str(doc_id)]=SUMMARY['oracleChecks'].get(str(doc_id),0)+1

    oracles={917:graph_oracle,918:blocks_brute,986:xor_oracle,3923:dungeon_oracle,4159:order_oracle,4161:maxsum_oracle,4189:scalar_oracle,4218:time_oracle,4303:matrix_oracle,4310:bees_oracle,4312:harmonic_oracle}
    rows={doc_id:snapshot(doc_id) for doc_id in ids}
    repaired_legacy={}
    for doc_id,row in rows.items():
        files=legacy_files(row)
        if doc_id==4207:
            continue
        legacy_input=files['1.in'].decode()
        if doc_id==4161 and re.search(r'\d-',legacy_input):
            parsed=list(map(int,re.findall(r'-?\d+',legacy_input)))
            SUMMARY['legacyChecks'][str(doc_id)]={'declaredCount':parsed[0],'actualCount':len(parsed)-1,'min':min(parsed[1:]),'max':max(parsed[1:]),'reason':'Missing delimiters, count mismatch, values outside statement bounds; regenerate legal case'}
            a=[RNG.randint(-10000,10000) for _ in range(100000)]
            legacy_input='100000\n'+' '.join(map(str,a))+'\n'
            repaired_legacy[doc_id]={'1.in':legacy_input,'1.out':maxsum_oracle(legacy_input)}
        expected=oracles[doc_id](legacy_input) if doc_id in oracles else files['1.out']
        expected=expected.encode() if isinstance(expected,str) else expected
        if doc_id not in repaired_legacy:
            assert files['1.out'].split()==expected.split(),(doc_id,'Legacy disagrees with oracle')
        verify(doc_id,legacy_input,expected,'legacy')
        if doc_id not in repaired_legacy:
            SUMMARY['legacyChecks'][str(doc_id)]='matches independent oracle and C++ reference'
    cases={doc_id:[] for doc_id in ids}
    def add(doc_id,inp,expected=None,label=''):
        expected=expected if expected is not None else oracles[doc_id](inp)
        verify(doc_id,inp,expected,label)
        cases[doc_id].append({'input':inp,'output':expected,'label':label})

    add(917,graph_input(2,[[1,2,7],[2,1,11]],[[2,1,1],[2,2,2],[2,1,2],[2,2,1],[1,1,1],[2,1,2],[1,2,1000000],[2,2,1]]),label='two nodes, self paths, both edge updates')
    add(917,graph_input(5,[[1,2,1],[2,3,2],[1,4,3],[4,5,4],[5,1,1],[3,1,1],[4,1,100],[2,1,100]],[[2,2,4],[2,4,2],[1,2,50],[2,2,4],[1,5,100],[2,4,2],[1,6,100],[2,2,4],[2,5,5]]),label='descendant return edge beats direct return, shuffled IDs')
    for run in range(3):
        n=30
        edges=[[RNG.randrange(1,i),i,RNG.randint(1,10**6)] for i in range(2,n+1)]
        back=[[i,1,RNG.randint(1,10**6)] for i in range(2,n+1)]; RNG.shuffle(edges); RNG.shuffle(back)
        queries=[[1,RNG.randint(1,2*n-2),RNG.randint(1,10**6)] if RNG.random()<.45 else [2,RNG.randint(1,n),RNG.randint(1,n)] for _ in range(700)]
        add(917,graph_input(n,edges+back,queries),label=f'Dijkstra random {run}')
    n=200000
    edges=[[i,i+1,10**6] for i in range(1,n)]+[[i,1,10**6] for i in range(2,n+1)]
    queries=[[2,1,n],[2,n,1],[2,n,n],[2,n,n-1],[2,2,n],[1,1,1],[2,1,n],[2,n,2],[2,1,2],[2,2,1]]
    expected=output_lines([199999000000,1000000,0,199999000000,199998000000,199998000001,1000001,1,1000000])
    add(917,graph_input(n,edges,queries),expected,label='maximum tree depth, 64-bit paths')
    edges=[[1,2,10],[1,3,20],[2,1,30],[3,1,40]]
    queries=[]
    for i in range(200000):
        queries.append([1,i%4+1,(i*7919)%1000000+1] if i%4 else [2,(i//4)%3+1,(i//12)%3+1])
    add(917,graph_input(3,edges,queries),label='maximum query count')

    for n,m in [(2,2),(2,3)]:
        for bits in itertools.product('01',repeat=n*m):
            text=f'{n} {m}\n'+'\n'.join(''.join(bits[r*m:(r+1)*m]) for r in range(n))+'\n'
            verify(918,text,blocks_brute(text),'exhaustive small grid')
    for text in ['2 2\n00\n00\n','3 3\n111\n111\n111\n','2 5\n11111\n11111\n','4 7\n0011000\n0011000\n1100111\n1100111\n']:
        add(918,text,label='uniformity and padding boundary')
    n,m=37,41
    add(918,f'{n} {m}\n'+'\n'.join(''.join(RNG.choice('01') for _ in range(m)) for _ in range(n))+'\n',label='random padded grids')
    for small in range(2,9):
        inp,out=blocks_pattern(small,small+1)
        assert blocks_brute(inp)==out
    inp,out=blocks_pattern(2500,2500)
    add(918,inp,out,label='maximum image, analytical checkerboard oracle')

    add(986,xor_input([[3,1,1],[1,3],[1,3],[1,4],[3,6,2],[3,6,3],[2,3],[3,3,1],[2,3],[3,3,1],[2,4],[3,100000000,100000000]]),label='empty army, duplicates, deletion, strict XOR boundary')
    add(986,xor_input([[1,1],[1,67108864],[1,99999999],[1,100000000],[3,1,1],[3,67108864,67108864],[3,100000000,100000000],[2,67108864],[3,67108864,67108864]]),label='top bit and maximum values')
    for run in range(2):
        current=[]; events=[[3,1,1]]
        for _ in range(2200):
            kind=RNG.randrange(3)
            if kind==0 or not current:
                p=RNG.randint(1,250); current.append(p); events.append([1,p])
            elif kind==1:
                index=RNG.randrange(len(current)); events.append([2,current.pop(index)])
            else:
                events.append([3,RNG.randint(1,300),RNG.randint(1,300)])
        add(986,xor_input(events),label=f'brute multiset random {run}')
    values=[1,3,7,15,31,63,127,67108864,99999999,100000000]
    current=Counter(); events=[]
    for i in range(100000):
        p=values[i%len(values)]
        if i%4==0:
            events.append([3,p,(i*101)%100000000+1])
        elif i%4==3 and current[p]:
            current[p]-=1; events.append([2,p])
        else:
            current[p]+=1; events.append([1,p])
    add(986,xor_input(events),label='maximum event count with duplicates')
    events=[[1,RNG.randint(1,10**8)] for _ in range(25000)]
    events += [[3,RNG.randint(1,10**8),RNG.randint(1,10**8)] for _ in range(30)]
    add(986,xor_input(events),label='wide trie and large populations')

    mazes=[[['SE']], [['S#E']], [['S..','##.','E..']]]
    add(3923,dungeon_input(mazes),label='adjacent cells, trap, corridor')
    generated=[]
    for size in [(2,3,4),(4,5,6),(30,30,30)]:
        l,r,c=size; cells=[RNG.choice('....#') for _ in range(l*r*c)]; cells[0]='S'; cells[-1]='E'
        generated.append([[''.join(cells[(z*r+y)*c:(z*r+y+1)*c]) for y in range(r)] for z in range(l)])
    add(3923,dungeon_input(generated),label='multiple mazes and maximum dimensions')

    for number,(value,word) in enumerate([('-3.25','world'),('0.75','GetString'),('12.34','Algorithm')],start=2):
        inp=value+'\n'+word+'\n'
        expected='please input a number:\nplease input a string:\n'+value+'\n'+word+'\n'
        add(4129,inp,expected,label='different real and string; existing display convention')

    add(4159,order_input([[('Alice','Bob'),('Bob','Carol')],[('B','a')]]),label='short chain and case-sensitive names')
    for run in range(2):
        groups=[]
        for _ in range(5):
            names=['Person'+chr(65+i//26)+chr(65+i%26) for i in range(60)]
            RNG.shuffle(names)
            edges=list(zip(names,names[1:]))
            for _ in range(25):
                a=RNG.randrange(len(names)-1); b=RNG.randrange(a+1,len(names)); edges.append((names[a],names[b]))
            RNG.shuffle(edges); groups.append(edges)
        add(4159,order_input(groups),label=f'shuffled unique order and redundant relations {run}')

    for a in [[-7],[-8,-3,-5,-1,-9],[4,-6,3,5,-2,9,-20,8],[10000]*100000,[-10000]*100000]:
        add(4161,str(len(a))+'\n'+' '.join(map(str,a))+'\n',label='nonempty maximum segment and bound')
    for _ in range(30):
        a=[RNG.randint(-10,10) for _ in range(15)]
        inp='15\n'+' '.join(map(str,a))+'\n'
        expected=f'{max(sum(a[l:r]) for l in range(15) for r in range(l+1,16))}\n'
        assert maxsum_oracle(inp)==expected
        verify(4161,inp,expected,'exhaustive interval oracle')

    add(4189,scalar_input([([1,3,-5],[-2,4,1]),([1000],[-1000]),([0,0],[3,-4])]),label='signed products and zero')
    add(4189,scalar_input([([RNG.randint(-8,8) for _ in range(6)],[RNG.randint(-8,8) for _ in range(6)]) for _ in range(10)]),label='all permutations checked')
    add(4189,scalar_input([([RNG.randint(-1000,1000) for _ in range(1000)],[RNG.randint(-1000,1000) for _ in range(1000)]) for _ in range(10)]),label='maximum groups and lengths')

    for mask in range(4096):
        cut={edge for edge in range(1,13) if mask&(1<<(edge-1))}
        assert cube_dual(cut)==cube_primal(cut)
    SUMMARY['cubeAllSubsets']=4096
    original_groups=[[1,2,3,4],[1,2,5,7,11,12],[1,4,5],[1,3,4,5,9,12],list(range(1,13))]
    assert cube_oracle(cube_input(original_groups))=='Yes\nYes\nNo\nNo\nYes\n'
    old_cube=legacy_files(rows[4207])
    raw_lines=[list(map(int,line.split())) for line in old_cube['1.in'].decode().splitlines()[1:] if line.strip()]
    assert len(raw_lines)==4095 and len({frozenset(row) for row in raw_lines})==4095
    fixed=cube_input(raw_lines); expected=cube_oracle(fixed)
    mismatches=sum(a!=b for a,b in zip(old_cube['1.out'].decode().split(),expected.split()))
    SUMMARY['legacyChecks']['4207']={'input':'4095 subsets lacked their count lines','outputMismatches':mismatches}
    verify(4207,fixed,expected,'all existing subsets corrected')
    add(4207,cube_input(original_groups),cube_oracle(cube_input(original_groups)),label='original Word sample')
    groups=[[]]+[[i] for i in range(1,13)]
    groups+=[list(cuts) for n in [4,5,6,7,8] for cuts in list(itertools.combinations(range(1,13),n))[:7]]
    for cuts in groups: RNG.shuffle(cuts)
    add(4207,cube_input(groups),cube_oracle(cube_input(groups)),label='zero cuts, one cut, unordered sets')

    add(4218,'1\n0\n',label='one record at midnight')
    add(4218,'8\n0\n9\n59\n60\n3599\n3600\n86399\n43201\n',label='second, minute, hour, final day boundary')
    seconds=[0,86399,60,3600]*25000
    add(4218,'100000\n'+output_lines(seconds),label='maximum number of records')

    add(4303,matrix_input([[1000]],[[-1000]]),label='one cell and signed cancellation')
    add(4303,matrix_input([[1,2,-3,4]],[[-1,3,2,-4]]),label='one row, no trailing spaces')
    a=[[RNG.randint(-1000,1000) for _ in range(100)] for _ in range(100)]
    b=[[RNG.randint(-1000,1000) for _ in range(100)] for _ in range(100)]
    add(4303,matrix_input(a,b),label='maximum matrix dimensions')

    add(4310,bees_input([[1,1,1,1,1,1,5]],[0,0,0,3,4,0]),label='equal velocities and distance five')
    add(4310,bees_input([[1,2,3,3,2,1,2]],[0,0,0,0,0,0]),label='noninteger distance')
    events=[[RNG.randint(-20,20) for _ in range(6)]+[RNG.randint(1,20)] for _ in range(50)]
    add(4310,bees_input(events,[-10,20,30,30,-20,-10]),label='multiple flights with signed displacement')

    add(4312,'0.01\n0.50\n0.51\n1.00\n5.20\n0.00\n',label='exact threshold and extremes')
    add(4312,''.join(f'{i//100}.{i%100:02d}\n' for i in range(1,521))+'0.00\n',label='every legal hundredth checked in Decimal')

    changes=[]
    for doc_id,row in rows.items():
        files=legacy_files(row)
        staged=[]
        for name,data in repaired_legacy.get(doc_id,{}).items():
            encoded=data.encode()
            staged.append({'name':name,'expectedSha256':sha(files[name]),'sha256':sha(encoded),'base64':base64.b64encode(encoded).decode()})
        if doc_id==4207:
            for name,data in [('1.in',fixed),('1.out',expected)]:
                encoded=data.encode()
                staged.append({'name':name,'expectedSha256':sha(files[name]),'sha256':sha(encoded),'base64':base64.b64encode(encoded).decode()})
        for number,case in enumerate(cases[doc_id],start=2):
            for suffix,kind in [('in','input'),('out','output')]:
                name=f'{number}.{suffix}'
                data=case[kind].encode()
                assert name not in files
                staged.append({'name':name,'expectedSha256':None,'sha256':sha(data),'base64':base64.b64encode(data).decode()})
        if doc_id in [917,918,986]:
            body=cf_statement(row)
        elif doc_id==3923:
            sample=dungeon_input([[['S....','.###.','.##..','###.#'],['#####','#####','##.##','##...'],['#####','#####','#.###','####E']],[['S##','#E#','###']]])
            body=replace_samples(row,sample,dungeon_oracle(sample))
            body=body.replace('多组测试数据。','多组测试数据。每组数据先给出层数 L、每层行数 R 和列数 C。每层之间有一个空行；以 `0 0 0` 结束输入。')
            body=body.replace('(3,4,,5)','(3,4,5)')
            body=body.replace('最小移动次数。','若能到达终点，输出 `Escaped in X minute(s).`，其中 X 是最少分钟数；否则输出 `Trapped!`。')
        elif doc_id==4129:
            body='<h2>题目描述</h2>\n编写函数 GetReal 和 GetString，在 main 函数中分别调用这两个函数。读入一个实数和一个字符串后，将读入的结果依次输出。\n<p>两次输入前要输出的提示信息分别是 <code>please input a number:</code> 和 <code>please input a string:</code>，每条提示信息独占一行。</p>\n<h2>输入格式</h2>\n一个实数和一个不含空格的字符串。\n<h2>输出格式</h2>\n先输出两行提示信息，再依次输出实数和字符串，各占一行。\n<h2>样例</h2>\n<pre><code class="language-input1">9.56\nhello</code></pre>\n<pre><code class="language-output1">please input a number:\nplease input a string:\n9.56\nhello</code></pre>\n<h2>来源</h2>\n蓝桥杯 算法提高\n'
        elif doc_id==4207:
            body=replace_samples(row,cases[doc_id][0]['input'],cases[doc_id][0]['output'])
            body=body.replace('/p/4207/file/lqimg1.png','/p/4207/file/cube-20261022.png')
            body=body.replace('(图在http://166.111.138.150/fop/attach/cube.jpg)。','')
            body=body.replace('若正方体会被分割成不少于2个部分','若正方体会被分割成不少于2个部分')
            body=body.replace('<h2>样例</h2>','<p>图中六个面的边界分别由以下棱组成：<code>1 2 3 4</code>、<code>9 10 11 12</code>、<code>1 5 8 9</code>、<code>2 7 8 10</code>、<code>3 6 7 11</code>、<code>4 5 6 12</code>。</p>\n<h2>样例</h2>')
        else:
            body=replace_samples(row,cases[doc_id][0]['input'],cases[doc_id][0]['output'])
        patch={'domainId':'system','docId':doc_id,'pid':row.get('pid'),'title':row['title'],'category':'local-sample-testdata','source':'Current source statement; independent oracles; fixed seed 20261022',
               'expected':{'contentSha256':sha(row['content']),'html':row.get('html')},'content':body,'html':True,'newContentSha256':sha(body),'testdata':staged,'testdataCount':1+len(cases[doc_id])}
        if doc_id==4207:
            image=(QA/'cube-docx-image2.png').read_bytes()
            patch['additionalFiles']=[{'name':'cube-20261022.png','expectedSha256':None,'sha256':sha(image),'base64':base64.b64encode(image).decode()}]
        changes.append(patch)
        SUMMARY['cases'][str(doc_id)]={'before':1,'after':1+len(cases[doc_id]),'labels':[case['label'] for case in cases[doc_id]]}
    batch = {'version':1,'date':'2026-10-22','problems':changes}
    packed = gzip.compress(json.dumps(batch,ensure_ascii=False,separators=(',',':')).encode(),compresslevel=9,mtime=0)
    (HERE/'local-tests.json.gz').write_bytes(packed)
    manifest = {'version':1,'date':'2026-10-22','batchSha256':sha(packed),'problems':[]}
    for patch in changes:
        entry = {key:value for key,value in patch.items() if key not in ['testdata','additionalFiles']}
        for kind in ['testdata','additionalFiles']:
            if kind in patch:
                entry[kind] = [{key:value for key,value in file.items() if key != 'base64'} for file in patch[kind]]
        manifest['problems'].append(entry)
    dump(HERE/'local-tests.manifest.json',manifest)
    dump(HERE/'testdata-validation.json',SUMMARY)
    print('BUILT_LOCAL',len(changes),'problems;',sum(len(c) for c in cases.values()),'new pairs;',sum(SUMMARY['oracleChecks'].values()),'reference comparisons; cube disagreements',mismatches)


if __name__=='__main__':
    main()
