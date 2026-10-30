"""Deterministic XCPC additions, in live DAG order, with independent checks.

Use --root for the private initial inventory/data/patches workspace. Inputs and
answers stay private; this source and the hash-only coverage manifest are public.
Existing files are preserved, identical inputs are skipped, and every answer is
checked against the reviewed C++ program before a guarded patch is emitted.
"""
from pathlib import Path
from collections import Counter,deque
from itertools import combinations,permutations,product
from functools import lru_cache
import argparse,base64,gzip,hashlib,json,math,random,re,subprocess,sys,time

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--from-order',type=int,default=1)
parser.add_argument('--to-order',type=int,default=108)
args=parser.parse_args()
ROOT=args.root.resolve()
sys.stdout.reconfigure(encoding='utf-8')
rows=json.loads(gzip.decompress((ROOT/'inventory.json.gz').read_bytes()))['problems']
ROW={r['docId']:r for r in rows}
rng=random.Random(20261022)
CASES={};ORACLE_COUNTS=Counter()
def add(pid,text,want=None,label='boundary'):
    CASES.setdefault(pid,[]).append((text.encode() if isinstance(text,str) else text,want,label))
def ints(a):return ' '.join(map(str,a))
def arr(pid,a,header=None,want=None,label='boundary'):
    add(pid,(str(len(a)) if header is None else header)+'\n'+ints(a)+'\n',want,label)
def graph(pid,n,edges,header=None,want=None,label='boundary'):
    add(pid,(f'{n} {len(edges)}' if header is None else header)+'\n'+''.join(ints(e)+'\n' for e in edges),want,label)
def string(pid,s,want=None,label='boundary'):add(pid,s+'\n',want,label)
def compile_ref(pid):
    suffix='.exe' if sys.platform=='win32' else ''
    out=ROOT/'bin'/f'{pid}{suffix}';out.parent.mkdir(exist_ok=True)
    src=HERE/'references'/f'{pid}.cpp'
    if not out.exists() or out.stat().st_mtime<src.stat().st_mtime:
        subprocess.run(['g++','-std=c++17','-O2',str(src),'-o',str(out)],check=True,capture_output=True)
    return out
BIN={}
def run(pid,text):
    BIN.setdefault(pid,compile_ref(pid))
    return subprocess.run([str(BIN[pid])],input=text.encode() if isinstance(text,str) else text,capture_output=True,timeout=45,check=True).stdout
def equal(pid,text,want):
    got=run(pid,text)
    assert got.split()==str(want).encode().split(),(pid,text[:180],got[:200],want)
    ORACLE_COUNTS[pid]+=1
def choose(n,k,mod=1000000007):return math.comb(n,k)%mod if 0<=k<=n else 0
def palindrome_pairs(s):
    p=[(i,j) for i in range(len(s)) for j in range(i+1,len(s)+1) if s[i:j]==s[i:j][::-1]]
    return sum(j<=x for i,j in p for x,y in p)
def partition_count(g,values):
    n,m=len(g),len(g[0]);want=sorted(values);total=sum(map(sum,g));ans=0
    for vector in [[sum(r) for r in g],[sum(g[i][j] for i in range(n)) for j in range(m)]]:
        for a,b in combinations(range(1,len(vector)),2):
            ans+=sorted([sum(vector[:a]),sum(vector[a:b]),sum(vector[b:])])==want
    return ans

# Chapters 1–3: elementary methods, simulation, data structures.
for totals,label in [([0]*7,'all-zero'),([8]*7,'exact-eight'),([9]*7,'earliest-tie'),([0]*6+[18],'Sunday-maximum'),([18,0,18,0,18,0,18],'multiple-maximum')]:
    add(4931,''.join(f'{min(v,9)} {max(0,v-9)}\n' for v in totals),0 if max(totals)<=8 else totals.index(max(totals))+1,label)
for a,b,label in [([1],[1],'single'),([9,1,9,1],[1,9,1,9],'front-back'),([10000]*999,[10000]*999,'n999-ties'),([1]*999,list(range(1,1000)),'n999-front'),(list(range(1,1000)),[1]*999,'n999-back')]:
    add(5,f'{len(a)}\n'+ints(a)+'\n'+ints(b)+'\n',None,label)
for n,segments,want,label in [(1,[(1,1,1)],1,'single'),(30000,[(1,30000,30000)]*5000,30000,'max-full-coverage'),(30000,[(1,30000,1)]*5000,1,'max-overlap'),(30000,[(i,i,1) for i in range(1,5001)],5000,'max-disjoint')]:
    add(3,f'{n}\n{len(segments)}\n'+''.join(ints(s)+'\n' for s in segments),want,label)
for intervals,want,label in [([(0,1)],1,'single'),([(i,i+1) for i in range(1000)],1000,'touching-endpoints'),([(0,1000)]*1000,1,'same-interval'),([(i,2000-i) for i in range(1000)],1,'nested'),([(999-i,1000-i) for i in range(1000)],1000,'reverse-input')]:
    graph(2,len(intervals),intervals,header=str(len(intervals)),want=want,label=label)
for n,edges,prices,want,label in [(3,[],[1]*3,-1,'empty'),(3,[(1,2),(2,3),(1,3)],[1000000]*3,3000000,'max-price'),(100,list(combinations(range(1,101),2)),list(range(100,0,-1)),6,'complete-graph'),(100,[(i,j) for i in range(1,51) for j in range(51,101)],[1]*100,-1,'complete-bipartite')]:
    add(3671,f'{n} {len(edges)}\n'+ints(prices)+'\n'+''.join(ints(e)+'\n' for e in edges),want,label)
for n,x,y in [(2,1,1),(2,2,2),(100,1,100),(100,50,50),(100,51,50),(100,50,51),(100,51,51),(100,49,50),(100,52,51)]:
    add(3635,f'{n} {x} {y}\n','NO' if x in [n//2,n//2+1] and y in [n//2,n//2+1] else 'YES','centre-or-border')
for s,label in [('a','single'),('abcd','impossible-small'),('a'*1000,'max-feasible'),('a'*500+'b'*500,'max-infeasible'),('a'*850+'b'*150,'component-threshold'),(''.join(rng.choice('abcdefghijklmnopqrstuvwxyz') for _ in range(1000)),'max-many-characters')]:string(3592,s,None,label)
for n,edges,want,label in [(1,[],0,'single-isolated'),(100,[(i,i+1) for i in range(1,100)],50,'max-chain-even'),(99,[(i,i+1) for i in range(1,99)],49,'max-chain-odd'),(100,[(1,i) for i in range(2,101)],1,'star'),(100,list(combinations(range(1,101),2)),0,'complete'),(100,[(1,2),(2,3),(3,1)]+[(i,i+1) for i in range(3,100)],97,'cycle-long-tail')]:graph(3571,n,edges,want=want,label=label)
for a,want,label in [([1,2],'0','none'),([1000]*200000,'200000\n'+ints(range(1,200001)),'max-all'),([1]*99999+[1000]*100001,0,'nonintegral-mean'),([1,2,3]*66666+[2,2],f'66668\n'+ints([i for i in range(1,199999) if i%3==2]+[199999,200000]),'max-many-matches')]:arr(3555,a,want=want,label=label)
for n,edges,want,label in [(1,[],'NO','single'),(3,[(1,2),(2,3),(1,3)],'FHTAGN!','triangle'),(100,[(i,i+1) for i in range(1,100)]+[(100,1)],'FHTAGN!','max-cycle'),(6,[(1,2),(2,3),(3,1),(4,5),(5,6),(6,4)],'NO','two-disconnected-cycles'),(100,list(combinations(range(1,101),2)),'NO','max-dense'),(100,[(1,2),(2,3),(3,1)]+[(i,i+1) for i in range(3,100)],'FHTAGN!','cycle-long-tail')]:graph(3668,n,edges,want=want,label=label)
for n,pipes,want,label in [(1,[],0,'single'),(1000,[(i,i+1,1000001-i) for i in range(1,1000)],'1\n1 1000 999002','max-chain'),(1000,[(i,i+1,1 if i==499 else 1000000) for i in range(1,1000)],'1\n1 1000 1','interior-bottleneck'),(1000,[(i,i+1,1000000) for i in range(1,1000)]+[(1000,1,1)],0,'max-cycle'),(1000,[(i,i+1,i) for i in range(1,1000,2)],'500\n'+''.join(f'{i} {i+1} {i}\n' for i in range(1,1000,2)),'many-tanks')]:graph(3656,n,pipes,want=want,label=label)
for g,values,label in [([[0,0,0]],[0,0,0],'zero-min'),([[0]*50 for _ in range(50)],[0,0,0],'max-zero'),([[100]*50 for _ in range(50)],[5000,5000,240000],'max-extreme-split'),([[100]*50 for _ in range(50)],[0,0,0],'sum-impossible'),([[rng.randrange(101) for _ in range(50)] for _ in range(50)],[1,2,3],'max-random')]:
    add(3604,f'{len(g)} {len(g[0])}\n'+''.join(ints(r)+'\n' for r in g)+ints(values)+'\n',partition_count(g,values),label)
for numbers,label in [(['1'],'single'),(['00000001','99999999'],'max-leading-zeros'),(['11111111']*8,'all-equal'),([''.join(rng.choice('0123456789') for _ in range(8)) for _ in range(8)],'max-permutations')]:
    add(3587,f'{len(numbers)} {len(numbers[0])}\n'+'\n'.join(numbers)+'\n',None,label)
for board,label in [(['........']*8,'empty'),(['SSSSSSSS']*8,'dense'),(['........']*6+['SS......','........'],'immediate-crush'),(['SSSSSSSS']+['........']*7,'top-row-delay'),([''.join(rng.choice('..S') for _ in range(8)) for _ in range(8)],'random')]:
    board=board.copy();board[0]=board[0][:-1]+'A';board[7]='M'+board[7][1:];add(3577,'\n'.join(board)+'\n',None,label)
add(3461,'1\na\n0\n','a','no-operations')
add(3461,'2000\n'+'a'*100+'\n20000\n'+''.join(f'{200000-i} a\n' for i in range(20000)),'a'*180000,'max-last-occurrence')
add(3461,'2000\n'+'a'*100+'\n20000\n'+'1 a\n'*20000,'a'*180000,'max-first-occurrence')
add(3461,'2000\n'+'ab'*50+'\n20000\n'+''.join(f'1 {"ab"[i%2]}\n' for i in range(20000)),'ab'*90000,'max-two-characters')
for s,want,label in [('a',0,'single'),('a'*2000,math.comb(2002,4),'max-all-palindromes'),('ab'*1000,None,'max-alternating'),(''.join(rng.choice('abcdefghijklmnopqrstuvwxyz') for _ in range(2000)),None,'max-random')]:string(3460,s,want,label)
for s,want,label in [('0',-1,'too-short'),('000',0,'three-zeros'),('100000010000001000000',3000000,'three-maximums'),('1'*30,-1,'too-long'),('0009',-1,'leading-zero'),('999999999999999',2000997,'six-digit-values')]:string(3399,s,want,label)
def party(pid,n,friends,enemies,want,label):add(pid,f'{n}\n{len(friends)}\n'+''.join(ints(e)+'\n' for e in friends)+f'{len(enemies)}\n'+''.join(ints(e)+'\n' for e in enemies),want,label)
for pid in [3386,3385]:
    party(pid,2,[],[],1,'isolated')
    party(pid,2000,[(i,i+1) for i in range(1,2000)],[],2000,'max-chain')
    party(pid,2000,[(i,i+1) for i in range(1,2000)],[(1,2000)],0,'one-enemy-invalidates-component')
    party(pid,2000,[(i,i+1) for i in range(1,1000)]+[(i,i+1) for i in range(1001,2000)],[(1,1001)],1000,'cross-component-enemies')
for a,want,label in [([10000],0,'single-no-cut'),([0]*100000,99999,'max-zero'),([10000]*100000,1,'max-positive'),([-10000]*100000,1,'max-negative'),([10000,-10000]*50000,49999,'max-cancelling')]:arr(3330,a,want=want,label=label)
for commands,want,label in [(['pwd'],'/','root'),(['cd /a/b','cd ../c','pwd','cd /','pwd'],'/a/c/\n/','absolute-relative'),(['cd '+'a/'*99+'a']*49+['pwd'],'/'+'a/'*4900,'max-depth'),(['cd /a/b','cd ../a/b','cd ..','pwd'],'/a/a/','same-names')]:add(3466,f'{len(commands)}\n'+'\n'.join(commands)+'\n',want,label)
for cards,want,label in [([(1,1)],0,'single'),([(i,i) for i in range(1,100001)],-1,'max-all-distinct'),([(i,1000000000) for i in range(1,100001)],50000,'max-flips'),([(4,4)]*100000,0,'same-front-back'),([(1,1),(1,2),(3,2),(4,2),(5,5)],3,'odd-majority')]:graph(3275,len(cards),cards,header=str(len(cards)),want=want,label=label)
for a,want,label in [([1],0,'single'),(list(range(1,100001)),0,'max-unchanged'),(list(range(100000,0,-1)),99999,'max-reverse'),([100000]+list(range(1,100000)),1,'one-moved'),(list(range(50001,100001))+list(range(1,50001)),50000,'long-moved-prefix')]:arr(3046,a,want=want,label=label)
add(3039,'1\n1\n1\n1 1\n',1,'single')
add(3039,'100000\n'+ints([1000000000]*100000)+'\n100000\n'+'100000 1000000000\n'*100000,'\n'.join(str(1000000000*(i+1)) for i in range(100000)),'max-64bit-stack')
add(3039,'4\n1 2 3 1000000000\n4\n1 1\n4 1\n1 1\n1 1\n','1\n1000000000\n1000000001\n1000000002','narrow-after-wide')
for a,k,want,label in [([1,1],1,'1 2','minimum'),([1000000000]*200000,100000,'1 100001','max64bit-half'),([1]*200000,1,'1 2','max-tie'),([1]*99998+[1000000000]*4+[1]*99998,2,'99999 100001','middle-peaks')]:arr(2824,a,header=f'{len(a)} {k}',want=want,label=label)
for n,statements,criminal,label in [(1,[1],1,'single-truth'),(1,[-1],1,'single-lie'),(100000,[-i for i in range(1,100001)],1,'max-ambiguous'),(100000,[1]*100000,1,'max-all-truth'),(100000,[i if i%2 else -i for i in range(1,100001)],2,'max-mixed')]:
    m=sum((x==criminal) if x>0 else (-x!=criminal) for x in statements)
    text=f'{n} {m}\n'+'\n'.join(f'{x:+d}' for x in statements)+'\n';add(3473,text,None,label)
add(3188,'2 0\n0\n0\n',-1,'disconnected')
add(3188,'2 1\n1 2 1\n100000 '+ints(range(100000))+'\n1 100000\n',100001,'long-wait-destination-ignored')
add(3188,'100000 99999\n'+''.join(f'{i} {i+1} 10000\n' for i in range(1,100000))+'0\n'*100000,999990000,'max-long-path')
add(3188,'4 4\n1 2 1\n2 4 1\n1 3 2\n3 4 2\n0\n5 1 2 3 4 5\n0\n0\n',4,'detour-around-wait')
for a,positions,want,label in [([0],[1,1,1,1],0,'same-position-empty'),([100000],[1,100001,1,1],100000,'max-horizontal'),([100000,0,100000],[1,100001,1,1],2,'leave-row-to-shorten'),([100000]*100,[1,100001,100,1],100099,'max-uniform'),([100000]*49+[0]+[100000]*50,[1,100001,100,1],99,'zero-middle')]:add(3103,f'{len(a)}\n'+ints(a)+'\n'+ints(positions)+'\n',want,label)
for s,want,label in [('+','No','single'),('+'*100000,'Yes','max-same'),('+-'*50000,'No','max-irreducible'),('+'*50000+'-'*50000,'Yes','max-two-blocks'),('+--+','Yes','cascading')]:string(2785,s,want,label)
for v,cost,want,label in [(0,[1]*9,-1,'zero'),(1,[2]*9,-1,'cannot-buy'),(1000000,[1]*9,'9'*1000000,'million-digits'),(1000000,[100000]*9,'9'*10,'max-cost'),(7,[2]*8+[3],'9'+'8'*2,'upgrade-leading'),(5,[3,4,5,5,5,5,5,5,5],'9','single-largest')]:add(2767,f'{v}\n'+ints(cost)+'\n',want,label)

# Chapters 4–5: graphs, shortest paths, state compression, dynamic programming.
for n,edges,label in [(3,[(1,2),(2,3),(3,1)],'triangle'),(3000,[(i,i+1) for i in range(1,3000)]+[(3000,1)],'max-cycle'),(3000,[(1,2),(2,3),(3,1)]+[(i,i+1) for i in range(3,3000)],'max-tail'),(3000,[(1,2),(2,3),(3,1)]+[(1,i) for i in range(4,3001)],'cycle-stars')]:graph(3563,n,edges,header=str(n),label=label)
for n,m,k,want,label in [(2000,2000,1,pow(2000,2000,1000000007),'max-no-constraints'),(1,2000,2000,2000,'k-greater-than-n'),(2000,2000,2000,pow(2000,1000,1000000007),'whole-palindrome'),(2000,2000,1999,4000000,'odd-k-parity'),(2000,2000,1000,2000,'even-k-collapse'),(2000,2000,2001,pow(2000,2000,1000000007),'vacuous-unused')]:
    if k<=2000:add(3488,f'{n} {m} {k}\n',want,label)
for grid,want,label in [(['#'],-1,'single'),(['##'],-1,'two'),(['###'],1,'articulation'),(['##','##'],2,'cycle'),(['#'*50]*50,2,'max-solid'),(['#'*50]+['.'*49+'#']*48+['#'*50],1,'max-u-shape')]:add(3318,f'{len(grid)} {len(grid[0])}\n'+'\n'.join(grid)+'\n',want,label)
for n,edges,want,label in [(2,[(1,2)],'0\n1','minimum'),(200000,[(i,i+1) for i in range(1,200000)],'0\n1','max-outward-chain'),(200000,[(i+1,i) for i in range(1,200000)],'0\n200000','max-inward-chain'),(200000,[(1,i) for i in range(2,200001)],'0\n1','max-star'),(200000,[(i,i+1) if i%2 else (i+1,i) for i in range(1,200000)],None,'max-multiple-capitals')]:graph(3225,n,edges,header=str(n),want=want,label=label)
for a,label in [([1],'minimum-cycle'),([1000000000]*199999,'max-immediate-exit'),([1]*199999,'max-long-state-walk'),([i for i in range(2,200001)],'max-return-to-one'),([rng.randint(1,200000) for i in range(199999)],'max-random')]:arr(3003,a,header=str(len(a)+1),label=label)
for n,edges,s,t,want,label in [(2,[(1,2,1000000000)],1,2,1000000000,'max-weight'),(2500,[(i,i+1,1000000000) for i in range(1,2500)],1,2500,2499000000000,'max64bit-chain'),(2500,[(1,i,1) for i in range(2,2501)],2,2500,2,'star'),(2,[(1,2,7),(1,2,3)],1,2,3,'parallel-edges'),(2,[(1,2,7)],1,1,0,'same-source-target')]:graph(632,n,edges,header=f'{n} {len(edges)} {s} {t}',want=want,label=label)
for n,edges,s,L,want,label in [(2,[(1,2,1)],1,0,1,'capital-distance-zero'),(2,[(1,2,1000)],1,500,1,'edge-interior'),(3,[(1,2,1),(1,3,1),(2,3,4)],1,3,1,'two-sides-same-point'),(3,[(1,2,1),(1,3,1),(2,3,8)],1,3,2,'two-distinct-interior-points'),(100000,[(i,i+1,1000) for i in range(1,100000)],1,99998500,1,'max-long-distance')]:add(3514,f'{n} {len(edges)} {s}\n'+''.join(ints(e)+'\n' for e in edges)+f'{L}\n',want,label)
for n,edges,want,label in [(2,[(1,2)],0,'minimum'),(200,[(i,i+1) for i in range(1,200)],99*99,'max-chain'),(200,[(1,i) for i in range(2,201)],0,'max-star'),(200,[(i//2,i) for i in range(2,201)],None,'balanced-tree')]:graph(3491,n,edges,header=str(n),want=want,label=label)
for start,end,segments,want,label in [((1,1),(1,2),[(1,1,2)],1,'minimum'),((1000000000,999900001),(1000000000,1000000000),[(1000000000,999900001,1000000000)],99999,'max-long-row'),((1,1),(1000000000,1000000000),[(1,1,1),(1000000000,1000000000,1000000000)],-1,'far-disconnected'),((1,1),(100000,1),[(i,1,1) for i in range(1,100001)],99999,'max-many-segments'),((1,1),(2,2),[(1,1,2),(1,1,2),(2,2,2)],1,'overlap-diagonal')]:add(3140,ints(start+end)+f'\n{len(segments)}\n'+''.join(ints(e)+'\n' for e in segments),want,label)
for jiro,ciel,want,label in [([('DEF',0)],[0],0,'def-strict'),([('ATK',0)],[0],0,'atk-equality'),([('ATK',0)],[8000]*100,800000,'all-clear-extra-damage'),([('DEF',8000)]*100,[8000]*100,0,'cannot-break-defense'),([('ATK',i) for i in range(100)],[8000]*100,800000-sum(range(100)),'max-attacks'),([('DEF',4000)]*50+[('ATK',1000)]*50,[8000]*100,350000,'max-mixed')]:add(2861,f'{len(jiro)} {len(ciel)}\n'+''.join(f'{x} {v}\n' for x,v in jiro)+'\n'.join(map(str,ciel))+'\n',want,label)
for grid,want,label in [(['A'],'Poor Dima!','no-D'),(['DIMA'],1,'one-word'),(['DI','AM'],'Poor Inna!','minimum-cycle'),(['D'*1000]*1000,'Poor Dima!','million-cells-no-complete'),(['DIMA'*250]*1000,250,'million-cells-finite'),([''.join('DIMA'[(i+j)%4] for j in range(1000)) for i in range(1000)],499,'million-cells-diagonal-DAG')]:add(2674,f'{len(grid)} {len(grid[0])}\n'+'\n'.join(grid)+'\n',want,label)
for s,want,label in [('a','Just a legend','single'),('aa','Just a legend','prefix-suffix-only'),('aaa','a','overlap-middle'),('a'*1000000,'a'*999998,'million-overlapping'),('ab'*500000,'ab'*499998,'million-periodic'),('a'*499999+'b'+'a'*500000,'a'*499999,'million-near-border')]:string(3582,s,want,label)
regex_pairs=[('a','a','Yes'),('a','b','No'),('a|bc','bc','Yes'),('(a|b)+','abba','Yes'),('(ab)*','ab'*50,'Yes'),('a+'+'b*','b','No'),('('*40+'a'+')'*40,'a','Yes'),('a*+'+'b','b','Yes'),('a|'+'b','ab','No'),('a'*100,'a'*100,'Yes')]
add(631,''.join(f'{p}\n{s}\n' for p,s,w in regex_pairs),'\n'.join(w for p,s,w in regex_pairs),'operators-grouping-length100')
for n,weight,want,label in [(1,4,0,'single'),(100000,4,100000*99999*99998,'max-all-lucky64bit'),(100000,444444444,100000*99999*99998,'nine-digit-lucky'),(100000,1,0,'max-no-lucky'),(100000,47,100000*99999*99998,'max-lucky-chain')]:graph(3649,n,[(i,i+1,weight) for i in range(1,n)],header=str(n),want=want,label=label)
for n,queries,want,label in [(1,[(1,0)],1,'single'),(100000,[(100000,0)]*100000,'\n'.join(['36']*100000),'max-all-divisors'),(100000,[(100000,i) for i in range(100000)],'36\n'+'0\n'*99999,'max-entire-history'),(100000,[(100000,0) if i%2==0 else (99991,1) for i in range(100000)],'\n'.join('36' if i%2==0 else '1' for i in range(100000)),'max-last-occurrence')]:add(3639,f'{n}\n'+''.join(ints(q)+'\n' for q in queries),want,label)
for n,k,edges,want,label in [(1,500,[],0,'single-large-k'),(50000,500,[(i,i+1) for i in range(1,50000)],49500,'max-chain-k500'),(50000,2,[(1,i) for i in range(2,50001)],math.comb(49999,2),'max-star-pair-count'),(50000,500,[(1,i) for i in range(2,50001)],0,'max-star-large-k'),(50000,1,[(i//2,i) for i in range(2,50001)],49999,'max-balanced-distance-one')]:graph(3447,n,edges,header=f'{n} {k}',want=want,label=label)
for s,t,want,label in [('a','a','Yes','single'),('a','aa','No','target-longer'),('a'*200000,'a','Yes','max-single-target'),('ab'*100000,'ab','Yes','max-cover-all'),('a'*100000+'b'+'a'*99999,'a','No','max-one-uncovered'),('a'*100000+'b'*100000,'a'*100000+'b'*100000,'Yes','max-identical')]:add(3208,s+'\n'+t+'\n',want,label)
for n,m in [(1,40),(40,1),(5,8),(8,5),(6,6),(2,20),(20,2),(4,10),(10,4)]:add(3638,f'{n} {m}\n',None,'max-area-orientation')
for s,a,b,want,label in [('a','a','a',1,'single-overlap'),('a'*2000,'a','a',2000,'max-duplicates'),('ab'*1000,'a','b',1000,'max-periodic'),('a'*2000,'a'*1001,'a'*1001,1000,'max-overlapping-identifiers'),('a'*2000,'b','a',0,'absent-prefix'),(''.join(rng.choice('ab') for i in range(2000)),'a','b',None,'max-random')]:add(3633,s+'\n'+a+'\n'+b+'\n',want,label)
for s,want,label in [('A','No solution','single-vowel'),('z','1 1','single-consonant'),('a'*200000,'No solution','max-all-vowels'),('Z'*200000,'200000 1','max-all-consonants'),('aAb'*66666+'aA','199998 3','mixed-case-ties'),('b'+'a'*199999,'3 1','one-consonant')]:string(3542,s,want,label)
for a,length,k,want,label in [([0],1,0,0,'single-zero'),([-1000000000],1,1,1000000000,'single-negative'),([1000000000,-1000000000]*50000,100000,0,0,'max-cancelling-k0'),([1000000000,-1000000000]*50000,100000,50000,100000000000000,'max-all-signs64bit'),([1000000000,-1000000000]*50000,50000,1,2000000000,'max-window-one-flip'),([0]*100000,100000,100000,0,'max-zero-large-k')]:add(3351,f'{len(a)} {length}\n'+ints(a)+f'\n{k}\n',want,label)
for n,edges,vol,s,t,want,label in [(2,[],[1],1,2,-1,'disconnected'),(100000,[(i,i+1) for i in range(1,100000)],[1],1,100000,99999,'max-one-volunteer'),(100000,[(i,i+1) for i in range(1,100000)],list(range(1,100001)),1,100000,1,'max-every-volunteer'),(100000,[(i,i+1) for i in range(1,100000)],list(range(1,100001,1000)),1,100000,1000,'max-volunteer-spacing'),(100000,[(1,i) for i in range(2,100001)],[2,3],2,100000,2,'max-star')]:add(3336,f'{n} {len(edges)} {len(vol)}\n'+ints(vol)+'\n'+''.join(ints(e)+'\n' for e in edges)+f'{s} {t}\n',want,label)

# Chapters 6–9: knapsack, counting, games, suffix structures and constructive tasks.
for n,c0,d0,recipes,want,label in [(1,100,100,[(1,100,100,100)],0,'nothing-affordable'),(1000,1,100,[(1,100,1,1)]*10,100000,'max-plain-buns'),(1000,100,1,[(100,1,1,100)]*10,100000,'max-full-bounded'),(1000,100,100,[(100,100,100,100)]*10,1000,'leftovers-and-same-value'),(999,100,1,[(100,100,100,100)]*10,900,'discard-remainder')]:add(3658,f'{n} {len(recipes)} {c0} {d0}\n'+''.join(ints(r)+'\n' for r in recipes),want,label)
for s,k,want,label in [('F',1,0,'single-odd-flip'),('F',50,1,'single-even-repeated-flips'),('T',49,1,'single-odd-repeated-flips'),('F'*100,50,100,'max-even-unused-pairs'),('F'*100,49,99,'max-odd-flip'),('T'*100,50,50,'max-turns'),('FT'*50,50,100,'max-all-forward')]:add(3558,s+f'\n{k}\n',want,label)
for s,label in [('()','single-pair'),('('*350+')'*350,'max-nesting'),('()'*350,'max-adjacent-pairs'),('(()())'*116+'(())','max-mixed-pairs')]:string(3496,s,4 if len(s)==2 else None,label)
for n,t,want,label in [(3,1,14,'minimum-peak'),(20,10,0,'too-many-peaks'),(20,1,0,'too-long-one-peak'),(20,9,None,'max-near-alternating'),(19,9,None,'tight-alternation'),(20,5,None,'max-many-camels')]:add(3490,f'{n} {t}\n',want,label)
for calls,k,want,label in [([],0,86400,'no-calls'),([(1,86400)],0,0,'whole-day'),([(86400,86400)],0,86399,'last-second'),([(i,86400) for i in range(1,4001)],4000,86400,'max-ignore-all'),([(i,86400) for i in range(1,4001)],3999,3999,'max-keep-one'),([(i,86400) for i in range(1,4001)],0,0,'max-backlog'),([(i,1) for i in range(1,4001)],2000,84400,'max-prefix-skip')]:add(3464,f'{len(calls)} {k}\n'+''.join(ints(c)+'\n' for c in calls),want,label)
for n,label in [(1,'minimum-one'),(2,'minimum-two'),(3,'sample-three'),(100000,'exact-maximum')]:add(798,f'{n}\n',1 if n<=2 else (2 if n==3 else None),label)
for n,m,k,want,label in [(1,1,1,0,'no-room'),(1000,1000,1000,0,'too-many-moves'),(1000,1000,499,998001,'maximum-tight-room'),(1000,1000,1,choose(999,2)**2%1000000007,'max-one-rectangle'),(1000,999,250,choose(999,500)*choose(998,500)%1000000007,'max-large-binomial')]:add(3575,f'{n} {m} {k}\n',want,label)
for a,k,want,label in [([4],1,1,'single-lucky'),([4]*100000,2,0,'max-same-lucky'),([4]*100000,1,100000,'max-lucky-positions'),([8]*100000,50000,choose(100000,50000),'max-nonlucky-binomial'),([4]*50000+[7]*50000,2,50000**2%1000000007,'two-lucky-types'),([4]*99999+[8],2,99999,'one-nonlucky')]:arr(3511,a,header=f'{len(a)} {k}',want=want,label=label)
lucky_values=[int(''.join(s)) for length in range(1,10) for s in product('47',repeat=length)]
arr(3511,(lucky_values*98)[:100000],header='100000 1000',label='max-all-lucky-types')
for words,want,label in [(['a','z','a'*100,'z'*100],'0\n'*4,'extreme-sums'),(['a'*99+'b']*10000,'99\n'*10000,'max-one-unit-sum'),(['z'*99+'y']*10000,'99\n'*10000,'max-one-unit-deficit'),([''.join(rng.choice('abcdefghijklmnopqrstuvwxyz') for i in range(100)) for j in range(10000)],None,'max-random-batch')]:add(3472,str(len(words))+'\n'+'\n'.join(words)+'\n',want,label)
for events,want,label in [(['sell 0'],0,'no-prize'),(['win 2000','sell 2000'],2**2000,'big-integer'),([v for x in range(2001) for v in [f'win {x}',f'sell {x}']],2**2001-1,'all-powers'),([f'win {x}' for x in range(2001)]+[f'sell {x}' for x in range(2001)],2**2000,'overlapping-hold-intervals'),(['win 0']*4999+['sell 0'],1,'max-repeated-prizes'),(['win 2000']+['win 0']*4998+['sell 2000'],2**2000,'max-keep-old-prize')]:add(3329,str(len(events))+'\n'+'\n'.join(events)+'\n',want,label)
for a,want,label in [([1],1,'single-odd'),([1000000000]*99999,99999000000000,'max-even64bit'),([999999999]*99999,99999*999999999,'max-odd64bit'),([1]*99999,99999,'max-one-crossing'),([1000000000,1]*49999+[1000000000],None,'max-even-bottlenecks')]:arr(3285,a,header=str(len(a)+1),want=want,label=label)
for floors,people,want,label in [(2,[(1,2,0),(1,2,1),(2,1,0),(2,1,1),(1,1,100000000)],'1\n3\n2\n2\n100000000','two-floors-phases'),(100000000,[(1,100000000,100000000)]*100000,'299999997\n'*100000,'max-arrivals'),(100000000,[(100000000,1,99999999)]*100000,'199999998\n'*100000,'max-immediate-descent'),(100000000,[(i+1,i+1,100000000) for i in range(100000)],'100000000\n'*100000,'max-same-floor')]:add(3622,f'{len(people)} {floors}\n'+''.join(ints(p)+'\n' for p in people),want,label)
for a,b,mod,want,label in [(0,0,1,2,'mod-one'),(1000000000,1000000000,10000000,2,'max-all-replies'),(1000000000,9999998,10000000,2,'zero-residue-sequence'),(1000000000,0,9999991,'1 000000001','first-winning-move'),(0,0,10000000,2,'only-zero-move'),(1,0,3,'1 000000001','nine-digit-leading-zero')]:add(3621,f'{a} {b} {mod}\n',want,label)
def is_lucky(x):return x>0 and all(c in '47' for c in str(x))
for n,k,want,label in [(1,1,0,'single'),(1,2,-1,'no-permutation'),(12,479001601,-1,'past-factorial'),(12,479001600,None,'last-permutation'),(1000000000,1,sum(x<=1000000000 for x in lucky_values),'max-identity'),(1000000000,1000000000,None,'max-rank-tail'),(777777777,1000000000,None,'lucky-position-tail')]:add(3597,f'{n} {k}\n',want,label)
for case,want,label in [((1,1000000,1000000,1000000,1),'1000000 0','target-cold'),((1,1000000,1000000,1000000,1000000),'0 1000000','target-hot'),((1000000,1000000,1000000,1000000,1000000),'1000000 1000000','all-same-temperature'),((1,3,1000000,1000000,2),'1000000 1000000','max-exact-balanced'),((1,1000000,1000000,1000000,2),'999998 1','max-unbalanced-exact'),((1,1000000,1,1000000,999999),None,'max-near-hot-rational')]:add(3583,ints(case)+'\n',want,label)
for n,want,label in [(1,0,'single'),(2,1,'first-move'),(832040,28,'Fibonacci-optimum'),(1000000,None,'maximum'),(999983,None,'large-prime'),(524288,None,'power-of-two')]:add(3554,f'{n}\n',want,label)
for s,want,label in [('00','00','minimum00'),('01','01','minimum01'),('10','10','minimum10'),('11','11','minimum11'),('?'*100000,'00\n01\n10\n11','max-all-unknown'),('0'*50000+'1'*50000,'01','max-exact-half-last1'),('1'*50000+'0'*50000,'10','max-exact-half-last0'),('0'*100000,'00','max-zero'),('1'*100000,'11','max-one'),('01'*49999+'?0',None,'max-threshold-uncertainty')]:string(3551,s,want,label)
laser_cases=[(2,2,1,1,2,2),(1000000000,1000000000,1,1,1000000000,1000000000),(1000000000,1000000000,1,1,2,1),(1000000000,1000000000,1,1,1000000000,1),(1000000000,1000000000,1,1,500000001,500000001)]
def laser_answer(case):
    n,m,x1,y1,x2,y2=case;dx=abs(x1-x2);dy=abs(y1-y2)
    return n*m-2*(n-dx)*(m-dy)+max(0,n-2*dx)*max(0,m-2*dy)
add(3458,str(len(laser_cases))+'\n'+''.join(ints(c)+'\n' for c in laser_cases),'\n'.join(str(laser_answer(c)) for c in laser_cases),'64bit-union-boundaries')
max_lasers=[(1000000000,1000000000,1,1,rng.randint(2,1000000000),rng.randint(2,1000000000)) for i in range(10000)]
add(3458,'10000\n'+''.join(ints(c)+'\n' for c in max_lasers),'\n'.join(str(laser_answer(c)) for c in max_lasers),'max-test-batch')
matrix_n=[1,2,3,4,5,6,7,1000000000000000000,999999999999999999]+list(range(8,99))
add(646,str(len(matrix_n))+'\n'+'\n'.join(map(str,matrix_n))+'\n',None,'max100-games-and-parity')
for n,want,label in [(2,1,'minimum-prime'),(3,2,'small-three'),(100000,9592,'known-pi-1e5'),(100000000000,4118054813,'known-pi-1e11')]:add(827,f'{n}\n',want,label)
for k,queries,label in [(2,[(3,3),(3,2000),(2000,3),(2000,2000)],'parity-triangular-boundaries'),(21,[(2000,2000)]*10000,'max-batch-composite-modulus'),(7,[(2000,3),(3,2000),(1999,2000),(2000,1999)],'asymmetric-query-bounds')]:add(753,f'{len(queries)} {k}\n'+''.join(ints(q)+'\n' for q in queries),None,label)
for n,p,k,r,want,label in [(1000000000,1073741823,1,0,pow(2,1000000000,1073741823),'max-composite-k1'),(1000000000,1073741823,2,1,pow(2,1999999999,1073741823),'max-composite-k2'),(1000000000,2,50,49,0,'max-parity-odd-residue'),(1000000000,1073741823,50,49,None,'max-ring-no-inverse'),(1,2,1,0,0,'small-mod2'),(1,15,50,49,50%15,'large-residue-single-block')]:add(696,f'{n} {p} {k} {r}\n',want,label)
for n,k,s,want,label in [(2,2,'09','9\n00','tie-smallest-digit'),(10000,10000,'09'*5000,'45000\n'+'0'*10000,'max-cost-lexicographic'),(10000,10000,'9'*10000,'0\n'+'9'*10000,'max-no-change'),(10000,5001,'0'*5000+'1'*5000,'1\n'+'0'*5001+'1'*4999,'max-tie-position'),(10000,10000,'0123456789'*1000,None,'max-all-digits')]:add(3616,f'{n} {k}\n{s}\n',want,label)
# Already extensive LOJ #645/#776 data are retained. Add direct boundary cases for other LOJ tasks.
merge_pairs=[('a','a',2),('a'*50,'a'*50,100),('a'*50,'b'*50,100),('ab'*25,'ba'*25,100),('abcdefghijklmnopqrstuvwxyz','zyxwvutsrqponmlkjihgfedcba',52)]
add(805,str(len(merge_pairs))+'\n'+''.join(a+'\n'+b+'\n' for a,b,w in merge_pairs),'\n'.join(str(w) for a,b,w in merge_pairs),'max-character-patterns')
for b,d,n,want,label in [(1,1,0,1,'zero-exponent'),(1,1,1000000000000000000,1,'equal-square-one'),(999999999,999999998000000001,1000000000000000000,pow(999999999,1000000000000000000,7528443412579576937),'max-square'),(999999999,999999999999999997,1000000000000000000,None,'max-irrational-even'),(999999999,999999999999999997,999999999999999999,None,'max-irrational-odd')]:add(681,f'{b} {d} {n}\n',want,label)
for a,b,want,label in [('a','a','-1\n-1\n-1\n-1','no-answer'),('a'*2000,'b'*2000,'1\n1\n1\n1','max-disjoint-alphabets'),('a'*2000,'a'*1999,'2000\n2000\n2000\n2000','max-one-extra-character'),('a'*1000+'b'*1000,'ab'*1000,None,'max-subsequence-vs-substring')]:add(688,a+'\n'+b+'\n',want,label)
for s,k,want,label in [('a',2,'No such line.','not-enough-substrings'),('a'*100000,100000,'a','max-repeated-k'),('a'*99999+'b',100000,'aa','max-duplicate-threshold'),('b'+'a'*99999,100000,'aa','max-leading-large'),(''.join(rng.choice('abcdefghijklmnopqrstuvwxyz') for i in range(100000)),100000,None,'max-random-SAM')]:add(3576,s+f'\n{k}\n',want,label)
for s,want,label in [('a',1,'single'),('a'*100000,math.comb(100002,3),'max-repetition64bit'),('ab'*50000,None,'max-periodic-clones'),(''.join(rng.choice('abcdefghijklmnopqrstuvwxyz') for i in range(100000)),None,'max-random-SAM')]:string(3589,s,want,label)
for s,words,want,label in [('AA',['A','AA','AAA'],1,'nonempty-parts'),('A'*100000,['A'*i for i in range(1,101)],99,'max-source-many-prefixes'),('A'*50000+'B'*50000,['A'*i+'B'*(1000-i) for i in range(1,101)],100,'max-source-max-patterns'),('AB'*50000,['A'*1000,'B'*1000,'AB'*500,'BA'*500],2,'two-block-gap-restriction')]:add(3495,s+f'\n{len(words)}\n'+'\n'.join(words)+'\n',want,label)
for words,k,want,label in [(['a'],1,0,'single'),(['a'*500]*2000,2000,math.comb(2000,2)*500,'max-all-identical64bit'),(['a'*500]*2000,1000,math.comb(1000,2)*500,'max-subset-identical'),(['a'*499+'b']*1000+['a'*499+'c']*1000,1000,math.comb(1000,2)*500,'max-select-one-cluster'),([''.join(rng.choice('abcdefghijklmnopqrstuvwxyz') for i in range(500)) for j in range(2000)],1000,None,'max-random-trie')]:add(3366,f'{len(words)} {k}\n'+'\n'.join(words)+'\n',want,label)
for a,want,label in [([0],'1\n0','single-zero'),(list(range(100000)),'100000\n'+ints(range(100000)),'max-distinct'),(list(range(50000))*2,'50000\n'+ints(range(50000)),'max-long-square'),([x for x in range(10000) for i in range(10)],'1\n9999','max-ten-occurrences'),([x for i in range(10) for x in range(10000)],'10000\n'+ints(range(10000)),'max-ten-large-squares')]:arr(3294,a,want=want,label=label)
for n,m,k,want,label in [(1000,1000,1,1,'max-single-color'),(1000,1,1000000,pow(1000000,1000,1000000007),'max-no-cuts'),(1,1000,1000000,1000000,'one-row-all-same'),(1000,2,1000000,None,'max-two-columns'),(1000,1000,1000000,None,'max-all-parameters')]:add(3637,f'{n} {m} {k}\n',want,label)
for l,r,want,label in [(1,1,0,'one-not-prime'),(2,2,1,'special-prime-two'),(3,3,0,'prime-three-excluded'),(5,5,1,'first-prime1mod4'),(1,100000,None,'small-full-count'),(299000000,300000000,None,'max-high-window')]:add(3632,f'{l} {r}\n',want,label)
for grid,want,label in [(['.'],4,'single-empty'),(['.'*500000],pow(2,500001,1000003),'max-long-row-empty'),(['.']*500000,pow(2,500001,1000003),'max-tall-column-empty'),(['.'*1000]*500,pow(2,1500,1000003),'max-rectangle-empty'),(['1'*1000]*500,0,'max-contradicting-fixed'),(['14'*500,'23'*500]*250,1,'max-fixed-valid')]:add(3627,f'{len(grid)} {len(grid[0])}\n'+'\n'.join(grid)+'\n',want,label)
for n,edges,want,label in [(1,[],0,'single'),(19,[],0,'max-empty'),(19,[(i,i+1) for i in range(1,19)],0,'max-tree'),(19,[(i,i+1) for i in range(1,19)]+[(19,1)],1,'max-one-cycle'),(19,list(combinations(range(1,20),2)),sum(math.factorial(19)//math.factorial(19-k)//(2*k) for k in range(3,20)),'max-complete64bit'),(19,[(i,j) for i in range(1,10) for j in range(10,20)],None,'max-complete-bipartite')]:graph(3609,n,edges,want=want,label=label)
for s,want,label in [('88',-1,'no-better'),('0'*200000,'0'*99999+'8'+'0'*99999+'8','max-change-left-half'),('8'*200000,-1,'max-already-best'),('9'*200000,-1,'max-no-larger'),('1'*100000+'9'*100000,'1'*99999+'2'+'0'*100000,'max-minimal-left-strokes'),(''.join(rng.choice('0123456789') for i in range(200000)),None,'max-random-ticket')]:string(3600,s,want,label)
for n,m,k,shuffle,label in [(1,2,1,False,'minimum'),(1,100,1,False,'max-row-first'),(100,1,1,True,'max-column-priority'),(99,100,1000000000000000000,True,'max-grid-saturated-k'),(100,99,1,True,'max-grid-random-priority'),(99,100,1000000000000000000,False,'max-grid-row-priority')]:
    p=list(range(1,n*m+1))
    if shuffle:rng.shuffle(p)
    add(3590,f'{n} {m} {k}\n'+''.join(ints(p[i*m:(i+1)*m])+'\n' for i in range(n)),None,label)
for a,want,label in [([0],0,'single-zero'),([1000000000,-1000000000]*2500,5000000000000,'max-alternating64bit'),(list(range(5000,0,-1)),6250000,'max-decreasing'),(list(range(-2500,2500)),0,'max-increasing'),([rng.randint(-1000000000,1000000000) for i in range(5000)],None,'max-random')]:add(3533,str(len(a))+'\n'+'\n'.join(map(str,a))+'\n',want,label)

def oracle_early():
    for _ in range(35):
        n=rng.randint(1,7);a=[rng.randint(1,15) for i in range(n)];b=[rng.randint(1,15) for i in range(n)]
        def finish(order):
            x=y=0
            for i in order:x+=a[i];y=max(x,y)+b[i]
            return y
        best=min(finish(order) for order in permutations(range(n)))
        got=run(5,f'{n}\n'+ints(a)+'\n'+ints(b)+'\n').split();order=[int(x)-1 for x in got[1:]]
        assert int(got[0])==best and sorted(order)==list(range(n)) and finish(order)==best
        ORACLE_COUNTS[5]+=1
        n=rng.randint(1,9);h=rng.randint(1,7);segments=[]
        for i in range(h):
            l=rng.randint(1,n);r=rng.randint(l,n);segments.append((l,r,rng.randint(1,r-l+1)))
        answer=min(mask.bit_count() for mask in range(1<<n) if all(sum(mask>>(i-1)&1 for i in range(l,r+1))>=t for l,r,t in segments))
        equal(3,f'{n}\n{h}\n'+''.join(ints(s)+'\n' for s in segments),answer)
        s=''.join(rng.choice('abc') for i in range(rng.randint(1,12)));equal(3460,s+'\n',palindrome_pairs(s))
        a=[rng.randrange(10) for i in range(rng.randint(2,15))];k=rng.randint(1,len(a)//2)
        pairs=[(sum(a[i:i+k])+sum(a[j:j+k]),i+1,j+1) for i in range(len(a)-2*k+1) for j in range(i+k,len(a)-k+1)]
        best=sorted(pairs,key=lambda x:(-x[0],x[1],x[2]))[0]
        equal(2824,f'{len(a)} {k}\n'+ints(a)+'\n',ints(best[1:]))
        n=rng.randint(1,8);s=rng.randint(1,6);cards=[(rng.randint(1,s),rng.randint(1,s)) for i in range(n)]
        answer=100
        for mask in range(1<<n):
            count=Counter(cards[i][mask>>i&1] for i in range(n))
            if max(count.values())*2>=n:answer=min(answer,mask.bit_count())
        equal(3275,f'{n}\n'+''.join(ints(c)+'\n' for c in cards),-1 if answer==100 else answer)
        v=rng.randrange(1,20);cost=[rng.randint(1,12) for i in range(9)];dp=['']*(v+1)
        for amount in range(1,v+1):
            candidates=[dp[amount-1]]+[dp[amount-cost[d-1]]+str(d) for d in range(1,10) if amount>=cost[d-1]]
            dp[amount]=max(candidates,key=lambda x:(len(x),x))
        equal(2767,f'{v}\n'+ints(cost)+'\n',dp[v] or '-1')
        k=rng.randint(1,4);s=''.join(rng.choice('abc') for i in range(rng.randint(1,6)));t=s*k;ops=[]
        for i in range(rng.randint(0,len(t)-1)):
            c=rng.choice(t);p=rng.randint(1,t.count(c));ops.append((p,c));j=[j for j,x in enumerate(t) if x==c][p-1];t=t[:j]+t[j+1:]
        equal(3461,f'{k}\n{s}\n{len(ops)}\n'+''.join(f'{p} {c}\n' for p,c in ops),t)
    print('XCPC_ORACLE_EARLY',dict(ORACLE_COUNTS),flush=True)

def oracle_middle():
    # Direct definitions and exhaustive small instances, independent of the C++ algorithms.
    for _ in range(32):
        n=rng.randint(1,6);m=rng.randint(1,3);k=rng.randint(1,7)
        want=sum(all(s[i:i+k]==s[i:i+k][::-1] for i in range(n-k+1)) for s in product(range(m),repeat=n))
        equal(3488,f'{n} {m} {k}\n',want)
        n=rng.randint(2,18);a=[0,0]+[rng.randint(1,20) for i in range(n-1)];outputs=[]
        for first in range(1,n):
            a[1]=first;x=1;y=0;direction=1;seen=set()
            while 1<=x<=n and (x,direction) not in seen:
                seen.add((x,direction));step=a[x];y+=step;x+=direction*step;direction=-direction
            outputs.append(y if x<1 or x>n else -1)
        equal(3003,str(n)+'\n'+ints(a[2:])+'\n',ints(outputs))
        n=rng.randint(2,11);edges=[(rng.randint(1,i-1),i) for i in range(2,n+1)];k=rng.randint(1,n+2)
        g=[[] for i in range(n)]
        for u,v in edges:g[u-1].append(v-1);g[v-1].append(u-1)
        distances=[]
        for start in range(n):
            d=[-1]*n;d[start]=0;q=deque([start])
            while q:
                u=q.popleft()
                for v in g[u]:
                    if d[v]<0:d[v]=d[u]+1;q.append(v)
            distances.append(d)
        equal(3447,f'{n} {k}\n'+''.join(ints(e)+'\n' for e in edges),sum(distances[i][j]==k for i in range(n) for j in range(i+1,n)))
        vol=rng.sample(range(1,n+1),rng.randint(1,n));s=rng.choice(vol);t=rng.choice([i for i in range(1,n+1) if i!=s])
        checkpoints=set(vol+[t]);best=next(q for q in range(1,n+1) if reachable_checkpoints(checkpoints,s,t,q,distances))
        equal(3336,f'{n} {n-1} {len(vol)}\n'+ints(vol)+'\n'+''.join(ints(e)+'\n' for e in edges)+f'{s} {t}\n',best)
        directed=[e if rng.randrange(2) else e[::-1] for e in edges];cost=[]
        for root in range(n):cost.append(sum(distances[root][u-1]>distances[root][v-1] for u,v in directed))
        best=min(cost);equal(3225,str(n)+'\n'+''.join(ints(e)+'\n' for e in directed),str(best)+'\n'+ints(i+1 for i,v in enumerate(cost) if v==best))
        s=''.join(rng.choice('abc') for i in range(rng.randint(1,18)));want='Just a legend'
        for length in range(1,len(s)):
            if s[:length]==s[-length:] and any(s[i:i+length]==s[:length] for i in range(1,len(s)-length)):want=s[:length]
        equal(3582,s+'\n',want)
        s=''.join(rng.choice('abc') for i in range(rng.randint(1,12)));t=''.join(rng.choice('abc') for i in range(rng.randint(1,5)))
        positions=set()
        for p in combinations(range(len(s)),len(t)):
            if ''.join(s[i] for i in p)==t:positions.update(p)
        equal(3208,s+'\n'+t+'\n','Yes' if len(positions)==len(s) else 'No')
        s=''.join(rng.choice('abc') for i in range(rng.randint(1,15)));a=''.join(rng.choice('abc') for i in range(rng.randint(1,4)));b=''.join(rng.choice('abc') for i in range(rng.randint(1,4)))
        subs={s[i:j] for i in range(len(s)) for j in range(i+1,len(s)+1)}
        equal(3633,s+'\n'+a+'\n'+b+'\n',sum(t.startswith(a) and t.endswith(b) for t in subs))
        s=''.join(rng.choice('aAbBzZ') for i in range(rng.randint(1,20)));good=[j-i for i in range(len(s)) for j in range(i+1,len(s)+1) if sum(c.lower() not in 'aeiou' for c in s[i:j])*2>=sum(c.lower() in 'aeiou' for c in s[i:j])]
        equal(3542,s+'\n',f'{max(good)} {good.count(max(good))}' if good else 'No solution')
        a=[rng.randint(-10,10) for i in range(rng.randint(1,9))];length=rng.randint(1,len(a));k=rng.randint(0,len(a));best=0
        for mask in range(1<<len(a)):
            if mask.bit_count()<=k:
                changed=[-x if mask>>i&1 else x for i,x in enumerate(a)]
                best=max(best,max(abs(sum(changed[i:i+length])) for i in range(len(a)-length+1)))
        equal(3351,f'{len(a)} {length}\n'+ints(a)+f'\n{k}\n',best)
        history=[];queries=[];answers=[]
        for i in range(rng.randint(1,30)):
            x=rng.randint(1,100);y=rng.randint(0,i);queries.append((x,y));answers.append(sum(x%d==0 and all(v%d for v in history[i-y:i]) for d in range(1,x+1)));history.append(x)
        equal(3639,str(len(queries))+'\n'+''.join(ints(q)+'\n' for q in queries),ints(answers))
    # Exhaust all connected 3x3 figures and small domination boards.
    for mask in range(1,1<<9):
        cells={(i//3,i%3) for i in range(9) if mask>>i&1}
        def connected(c):
            if not c:return True
            visited={next(iter(c))};q=deque(visited)
            while q:
                x,y=q.popleft()
                for p in [(x+1,y),(x-1,y),(x,y+1),(x,y-1)]:
                    if p in c and p not in visited:visited.add(p);q.append(p)
            return visited==c
        if not connected(cells):continue
        best=-1
        for k in range(1,len(cells)):
            if any(not connected(cells-set(p)) for p in combinations(cells,k)):best=k;break
        equal(3318,'3 3\n'+'\n'.join(''.join('#' if (i,j) in cells else '.' for j in range(3)) for i in range(3))+'\n',best)
    for n,m in [(1,1),(1,8),(2,2),(2,5),(3,3),(3,4),(4,3)]:
        N=n*m;cover=[]
        for i in range(N):
            r,c=divmod(i,m);cover.append(sum(1<<(x*m+y) for x,y in [(r,c),(r+1,c),(r-1,c),(r,c+1),(r,c-1)] if 0<=x<n and 0<=y<m))
        best=N
        for mask in range(1<<N):
            if mask.bit_count()>=best:continue
            merged=0
            for i in range(N):
                if mask>>i&1:merged|=cover[i]
            if merged==(1<<N)-1:best=mask.bit_count()
        equal(3638,f'{n} {m}\n',N-best)
    # Python's independent regex engine shares the specified nonempty-language semantics.
    for _ in range(48):
        atoms=[rng.choice('abc'),f'({rng.choice("abc")}|{rng.choice("abc")})']
        p=''.join(rng.choice(atoms)+rng.choice(['','*','+']) for i in range(rng.randint(1,4)));s=''.join(rng.choice('abc') for i in range(rng.randint(1,12)))
        equal(631,p+'\n'+s+'\n','Yes' if re.fullmatch(p,s) else 'No')
    print('XCPC_ORACLE_MIDDLE',dict(ORACLE_COUNTS),flush=True)

def reachable_checkpoints(points,s,t,q,distances):
    seen={s};queue=deque([s])
    while queue:
        u=queue.popleft()
        for v in points-seen:
            if distances[u-1][v-1]<=q:seen.add(v);queue.append(v)
    return t in seen

def oracle_late():
    for _ in range(32):
        n=rng.randint(1,20);m=rng.randint(1,3);c0=rng.randint(1,8);d0=rng.randint(1,9);recipes=[(rng.randint(1,6),rng.randint(1,6),rng.randint(1,8),rng.randint(1,9)) for i in range(m)]
        best=0
        for counts in product(*[range(a//b+1) for a,b,c,d in recipes]):
            used=sum(x*c for x,(a,b,c,d) in zip(counts,recipes));value=sum(x*d for x,(a,b,c,d) in zip(counts,recipes))
            if used<=n:best=max(best,value+(n-used)//c0*d0)
        equal(3658,f'{n} {m} {c0} {d0}\n'+''.join(ints(r)+'\n' for r in recipes),best)
        s=''.join(rng.choice('FT') for i in range(rng.randint(1,9)));k=rng.randint(1,15);best=0
        for mask in range(1<<len(s)):
            if mask.bit_count()<=k and mask.bit_count()%2==k%2:
                x=0;direction=1
                for i,c in enumerate(s):
                    if mask>>i&1:c='F' if c=='T' else 'T'
                    if c=='T':direction=-direction
                    else:x+=direction
                best=max(best,abs(x))
        equal(3558,s+f'\n{k}\n',best)
        n=rng.randint(3,7);t=rng.randint(1,4);count=0
        for a in product(range(1,5),repeat=n):
            if all(a[i]!=a[i+1] for i in range(n-1)) and sum(a[i-1]<a[i]>a[i+1] for i in range(1,n-1))==t and sum(a[i-1]>a[i]<a[i+1] for i in range(1,n-1))==t-1:count+=1
        equal(3490,f'{n} {t}\n',count)
        n=rng.randint(0,9);k=rng.randint(0,n);times=sorted(rng.sample(range(1,86401),n));calls=[(t,rng.randint(1,86400)) for t in times];best=0
        for ignored in range(1<<n):
            if ignored.bit_count()>k:continue
            end=1;longest=0
            for i,(t,d) in enumerate(calls):
                if not(ignored>>i&1):longest=max(longest,t-end);end=max(end,t)+d
            best=max(best,longest,86401-end)
        equal(3464,f'{n} {k}\n'+''.join(ints(c)+'\n' for c in calls),best)
        n=rng.randint(1,12);k=rng.randint(1,n);a=[rng.choice([4,7,44,8,9,14]) for i in range(n)]
        best=sum(len([a[i] for i in p if is_lucky(a[i])])==len({a[i] for i in p if is_lucky(a[i])}) for p in combinations(range(n),k))
        equal(3511,f'{n} {k}\n'+ints(a)+'\n',best)
        events=[];sold=set();dp={-1:0}
        for i in range(rng.randint(1,20)):
            x=rng.randint(0,10);op=rng.choice(['win','sell'])
            if op=='sell' and x in sold:op='win'
            if op=='sell':sold.add(x)
            events.append((op,x));nextdp=dp.copy()
            if op=='win':nextdp[x]=max(dp.values())
            elif x in dp:nextdp[-1]=max(nextdp.get(-1,0),dp[x]+2**x);nextdp.pop(x,None)
            dp=nextdp
        equal(3329,str(len(events))+'\n'+''.join(f'{op} {x}\n' for op,x in events),max(dp.values()))
        a=tuple(rng.randint(1,4) for i in range(rng.randint(1,6)))
        @lru_cache(None)
        def bridge(pos,state):
            best=0
            for e,target in [(pos-1,pos-1),(pos,pos+1)]:
                if 0<=e<len(state) and state[e]:
                    nextstate=list(state);nextstate[e]-=1;best=max(best,1+bridge(target,tuple(nextstate)))
            return best
        equal(3285,str(len(a)+1)+'\n'+ints(a)+'\n',max(bridge(i,a) for i in range(len(a)+1)))
        m=rng.randint(2,10);people=[(rng.randint(1,m),rng.randint(1,m),rng.randint(0,100)) for i in range(12)];answers=[]
        cycle=list(range(1,m+1))+list(range(m-1,1,-1))
        for s,f,t in people:
            if s==f:answers.append(t);continue
            time=t
            while cycle[time%len(cycle)]!=s:time+=1
            while cycle[time%len(cycle)]!=f:time+=1
            answers.append(time)
        equal(3622,f'{len(people)} {m}\n'+''.join(ints(p)+'\n' for p in people),ints(answers))
        a=rng.randint(0,40);b=rng.randint(0,40);mod=rng.randint(1,70);best=next((x for x in range(a+1) if all((x*1000000000+y)%mod for y in range(b+1))),None)
        equal(3621,f'{a} {b} {mod}\n',2 if best is None else f'1 {best:09d}')
        n=rng.randint(1,8);k=rng.randint(1,min(math.factorial(n)+2,100000));perm=next((p for i,p in enumerate(permutations(range(1,n+1)),1) if i==k),None)
        equal(3597,f'{n} {k}\n',-1 if perm is None else sum(is_lucky(i+1) and is_lucky(x) for i,x in enumerate(perm)))
        t1=rng.randint(1,12);t2=rng.randint(t1,20);t0=rng.randint(t1,t2);x1=rng.randint(1,12);x2=rng.randint(1,12);best=None;bestpair=None
        from fractions import Fraction
        for y1 in range(x1+1):
            for y2 in range(x2+1):
                if y1+y2 and t1*y1+t2*y2>=t0*(y1+y2):
                    key=(Fraction(t1*y1+t2*y2,y1+y2),-(y1+y2))
                    if best is None or key<best:best=key;bestpair=(y1,y2)
        got=list(map(int,run(3583,f'{t1} {t2} {x1} {x2} {t0}\n').split()))
        assert len(got)==2 and 0<=got[0]<=x1 and 0<=got[1]<=x2 and (Fraction(t1*got[0]+t2*got[1],sum(got)),-sum(got))==best
        ORACLE_COUNTS[3583]+=1
        n=rng.randint(2,8);s=''.join(rng.choice('01?') for i in range(n))
        @lru_cache(None)
        def play(text,turn):
            if len(text)==2:return text
            outcomes=[play(text[:i]+text[i+1:],1-turn) for i in range(len(text))]
            return min(outcomes) if turn==0 else max(outcomes)
        positions=[i for i,c in enumerate(s) if c=='?'];outcomes=set()
        for bits in product('01',repeat=len(positions)):
            text=list(s)
            for i,c in zip(positions,bits):text[i]=c
            outcomes.add(play(''.join(text),0))
        equal(3551,s+'\n','\n'.join(sorted(outcomes)))
        n=rng.randint(2,12);m=rng.randint(2,12);a=(rng.randint(1,n),rng.randint(1,m));b=a
        while b==a:b=(rng.randint(1,n),rng.randint(1,m))
        melted=set()
        for dx in range(-n,n+1):
            for dy in range(-m,m+1):
                if all(1<=x+dx<=n and 1<=y+dy<=m for x,y in [a,b]):melted.update((x+dx,y+dy) for x,y in [a,b])
        case=(n,m)+a+b;equal(3458,'1\n'+ints(case)+'\n',n*m-len(melted))
        n=rng.randint(1,5);p=rng.randint(2,50);k=rng.randint(1,8);r=rng.randrange(k)
        equal(696,f'{n} {p} {k} {r}\n',sum(math.comb(n*k,i) for i in range(r,n*k+1,k))%p)
    for n in range(1,50):
        dp=[0]*(n+1);dp[0]=1
        for v in range(1,n+1):
            nextdp=dp.copy()
            for x in range(1,v+1):
                for amount in range(x*v,n+1):nextdp[amount]+=dp[amount-x*v]
            dp=nextdp
        equal(798,f'{n}\n',dp[n]%23333333)
    # Number-pair shortest paths, without Euclidean quotient reasoning.
    dist={(1,1):0};queue=deque([(1,1)])
    while queue:
        a,b=queue.popleft()
        for pair in [(a+b,b),(a,a+b)]:
            if max(pair)<=100 and pair not in dist:dist[pair]=dist[(a,b)]+1;queue.append(pair)
    for n in range(1,101):equal(3554,f'{n}\n',min(v for (a,b),v in dist.items() if n in [a,b]))
    # Check prime-count and NOIP binomial-query definitions on short inputs.
    for _ in range(20):
        n=rng.randint(2,5000);composite=[False]*(n+1)
        for v in range(2,n+1):
            if not composite[v]:
                for j in range(v*v,n+1,v):composite[j]=True
        equal(827,f'{n}\n',sum(not composite[v] for v in range(2,n+1)))
        k=rng.randint(2,21);queries=[(rng.randint(3,30),rng.randint(3,30)) for i in range(8)]
        equal(753,f'{len(queries)} {k}\n'+''.join(ints(q)+'\n' for q in queries),ints(sum(math.comb(i,j)%k==0 for i in range(n+1) for j in range(min(i,m)+1)) for n,m in queries))
    print('XCPC_ORACLE_LATE',dict(ORACLE_COUNTS),flush=True)

def oracle_tail():
    for _ in range(36):
        s=''.join(rng.choice('abc') for i in range(rng.randint(1,16)));substrings=[s[i:j] for i in range(len(s)) for j in range(i+1,len(s)+1)];substrings.sort();k=rng.randint(1,len(substrings)+5)
        equal(3576,s+f'\n{k}\n',substrings[k-1] if k<=len(substrings) else 'No such line.')
        frequency=Counter(substrings);equal(3589,s+'\n',sum(v*(v+1)//2 for v in frequency.values()))
        s=''.join(rng.choice('ABC') for i in range(rng.randint(2,12)));words=list({''.join(rng.choice('ABC') for i in range(rng.randint(1,6))) for j in range(8)})
        possible={s[a:b]+s[c:d] for a in range(len(s)) for b in range(a+1,len(s)+1) for c in range(b,len(s)) for d in range(c+1,len(s)+1)}
        equal(3495,s+f'\n{len(words)}\n'+'\n'.join(words)+'\n',sum(w in possible for w in words))
        a=[rng.randint(-8,8) for i in range(rng.randint(1,10))];values=sorted(set(a));dp=[0]*len(values)
        for x in a:
            prefix=10**9;nextdp=[]
            for j,v in enumerate(values):prefix=min(prefix,dp[j]);nextdp.append(prefix+abs(x-v))
            dp=nextdp
        equal(3533,str(len(a))+'\n'+'\n'.join(map(str,a))+'\n',min(dp))
        n=rng.randint(1,7);edges=[(i,j) for i in range(n) for j in range(i+1,n) if rng.randrange(2)];adj=[set() for i in range(n)]
        for i,j in edges:adj[i].add(j);adj[j].add(i)
        cycles=set()
        def dfs(path):
            u=path[-1]
            for v in adj[u]:
                if v==path[0] and len(path)>=3:cycles.add(min(tuple(path),tuple([path[0]]+path[:0:-1])))
                elif v>path[0] and v not in path:dfs(path+[v])
        for i in range(n):dfs([i])
        equal(3609,f'{n} {len(edges)}\n'+''.join(f'{i+1} {j+1}\n' for i,j in edges),len(cycles))
    # Enumerate every bracket matrix for tiny boards and order by the supplied priorities.
    for n,m in [(1,2),(1,4),(2,3),(3,2),(3,4)]:
        priority=list(range(1,n*m+1));rng.shuffle(priority);order=sorted(range(n*m),key=lambda i:priority[i]);valid=[]
        for bits in product('()',repeat=n*m):
            balances=[set() for i in bits];good=True
            for r in range(n):
                for c in range(m):
                    values=({0} if r==c==0 else set())|(balances[(r-1)*m+c] if r else set())|(balances[r*m+c-1] if c else set())
                    balances[r*m+c]={x+(1 if bits[r*m+c]=='(' else -1) for x in values}
                    if any(x<0 for x in balances[r*m+c]):good=False;break
                if not good:break
            if good and balances[-1]=={0}:valid.append(bits)
        valid.sort(key=lambda b:tuple(b[i] for i in order))
        for k,b in enumerate(valid,1):
            text=f'{n} {m} {k}\n'+''.join(ints(priority[r*m:(r+1)*m])+'\n' for r in range(n))
            equal(3590,text,'\n'.join(''.join(b[r*m:(r+1)*m]) for r in range(n)))
    # Enumerate physical pipe endpoints; no parity-variable formula in this oracle.
    directions=[{'U','L'},{'D','L'},{'D','R'},{'U','R'}]
    for _ in range(30):
        n,m=rng.choice([(1,1),(1,3),(2,2),(2,3)]);cells=[rng.choice('.1234') for i in range(n*m)];unknown=[i for i,c in enumerate(cells) if c=='.'];best=0
        for assigned in product('1234',repeat=len(unknown)):
            a=cells.copy()
            for i,c in zip(unknown,assigned):a[i]=c
            good=True
            for r in range(n):
                for c in range(m):
                    u=directions[int(a[r*m+c])-1]
                    if r+1<n and (('D' in u)!=('U' in directions[int(a[(r+1)*m+c])-1])):good=False
                    if c+1<m and (('R' in u)!=('L' in directions[int(a[r*m+c+1])-1])):good=False
            best+=good
        equal(3627,f'{n} {m}\n'+''.join(''.join(cells[r*m:(r+1)*m])+'\n' for r in range(n)),best)
    # Full reachable license plates for short strings, including lexical ties.
    for _ in range(16):
        n=rng.randint(2,4);k=rng.randint(2,n);s=''.join(rng.choice('0123456789') for i in range(n));candidates=[]
        for chars in product('0123456789',repeat=n):
            if max(Counter(chars).values())>=k:candidates.append((sum(abs(int(x)-int(y)) for x,y in zip(s,chars)),''.join(chars)))
        cost,plate=min(candidates);equal(3616,f'{n} {k}\n{s}\n',f'{cost}\n{plate}')
    # Exact real-number floor using high precision on small exponents.
    from decimal import Decimal,localcontext,ROUND_FLOOR
    for _ in range(32):
        b=rng.randrange(1,50,2);choices=[d for d in range(b*b,(b+1)*(b+1)) if d%4==1];d=rng.choice(choices);n=rng.randint(0,35)
        with localcontext() as ctx:
            ctx.prec=200;x=(Decimal(b)+Decimal(d).sqrt())/2;want=int((x**n).to_integral_value(rounding=ROUND_FLOOR))%7528443412579576937
        equal(681,f'{b} {d} {n}\n',want)
    for _ in range(24):
        l=rng.randint(1,10000);r=l+rng.randint(0,2000);best=0
        for v in range(l,r+1):
            if v>=2 and all(v%d for d in range(2,math.isqrt(v)+1)) and any(v-a*a>0 and math.isqrt(v-a*a)**2==v-a*a for a in range(1,math.isqrt(v)+1)):best+=1
        equal(3632,f'{l} {r}\n',best)
    print('XCPC_ORACLE_TAIL',dict(ORACLE_COUNTS),flush=True)

def build():
    selected=[r for r in rows if args.from_order<=r['order']<=args.to_order and r['docId'] in CASES]
    if args.from_order<=36 and args.to_order>=5:oracle_early()
    if args.from_order<=62 and args.to_order>=37:oracle_middle()
    if args.from_order<=88 and args.to_order>=63:oracle_late()
    if args.from_order<=108 and args.to_order>=89:oracle_tail()
    patches=[];manifest=[]
    prior={}
    for file in sorted(ROOT.glob('patches-*.json')):
        if file.name.startswith('patches-data-') and file.name==f'patches-data-{args.from_order}-{args.to_order}.json':continue
        for p in json.loads(file.read_text(encoding='utf-8')):prior.setdefault(p['pid'],[]).append(p)
    for row in selected:
        pid=row['docId'];known={f['sha256'] for f in row['fileAudit'] if f['kind']=='testdata' and f['name'].endswith('.in')}
        used={f['name'] for f in row['fileAudit'] if f['kind']=='testdata'};count=row['parsedConfig']['count']
        for patch in prior.get(pid,[]):
            used.update(f['name'] for f in patch.get('files',[]));known.update(f['sha256'] for f in patch.get('files',[]) if f['name'].endswith('.in'));count=max(count,patch.get('expectedCases',count))
        number=1+max([int(Path(n).stem) for n in used if re.fullmatch(r'\d+\.in',n)]+[0]);files=[];coverage=[]
        for inp,want,label in CASES[pid]:
            digest=hashlib.sha256(inp).hexdigest()
            if digest in known:continue
            started=time.monotonic();out=run(pid,inp)
            if want is not None:assert out.split()==str(want).encode().split(),('ANSWER',pid,label,out[:200],str(want)[:200])
            dest=ROOT/'generated'/str(pid);dest.mkdir(parents=True,exist_ok=True)
            for name,data in [(f'{number}.in',inp),(f'{number}.out',out)]:
                assert name not in used,(pid,name)
                files.append(dict(name=name,base64=base64.b64encode(data).decode(),sha256=hashlib.sha256(data).hexdigest(),expectedSha256=None))
                (dest/name).write_bytes(data);used.add(name)
            coverage.append(dict(input=f'{number}.in',label=label,inputBytes=len(inp),answerBytes=len(out),inputSha256=digest,answerSha256=hashlib.sha256(out).hexdigest(),independentKnownAnswer=want is not None,localSeconds=round(time.monotonic()-started,3)))
            number+=1;known.add(digest)
        if files:
            count+=len(coverage)
            patches.append(dict(pid=pid,reason='Strengthen boundary, tie, overflow and maximum-size coverage with deterministic validated tests',files=files,expectedCases=count))
            manifest.append(dict(order=row['order'],pid=pid,title=row['title'],originalCases=row['parsedConfig']['count'],expectedCases=count,added=coverage,oracleChecks=ORACLE_COUNTS[pid]))
            print('XCPC_DATA_BUILT',row['order'],pid,'added',len(coverage),'cases',count,flush=True)
    name=f'patches-data-{args.from_order}-{args.to_order}.json'
    (ROOT/name).write_text(json.dumps(patches),encoding='utf-8')
    (HERE/f'data-manifest-{args.from_order}-{args.to_order}.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/f'oracle-data-{args.from_order}-{args.to_order}.json').write_text(json.dumps(ORACLE_COUNTS,indent=2),encoding='utf-8')
    print('XCPC_DATA_PATCH_READY',name,len(patches),sum(len(p['files'])//2 for p in patches),flush=True)

if __name__=='__main__':build()
