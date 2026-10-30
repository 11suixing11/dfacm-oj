"""Independent calculations and witness validation for chapter 7."""
from array import array
from bisect import bisect_left
from collections import Counter, defaultdict, deque
from decimal import Decimal, localcontext
from functools import lru_cache
from heapq import heappop, heappush
from itertools import combinations
import math
import re


def edit_distance(a, b):
    if not b:
        return len(a)
    masks = {}
    for j, ch in enumerate(b):
        masks[ch] = masks.get(ch, 0) | (1 << j)
    mask = (1 << len(b)) - 1
    top = 1 << (len(b) - 1)
    positive, negative, score = mask, 0, len(b)
    for ch in a:
        same = masks.get(ch, 0)
        vertical = same | negative
        horizontal = (((same & positive) + positive) ^ positive) | same
        plus = negative | ~(horizontal | positive)
        minus = positive & horizontal
        score += bool(plus & top) - bool(minus & top)
        plus = ((plus << 1) | 1) & mask
        minus = (minus << 1) & mask
        positive = (minus | ~(vertical | plus)) & mask
        negative = plus & vertical
    return score


def partitions(n, k):
    d = [[0] * (k + 1) for _ in range(n + 1)]
    d[0][0] = 1
    for total in range(1, n + 1):
        for count in range(1, min(total, k) + 1):
            d[total][count] = d[total - 1][count - 1]
            if total >= count:
                d[total][count] += d[total - count][count]
    return d[n][k]


def lcis(a, b):
    sequences = [()] * len(b)
    for x in a:
        best = ()
        for j, y in enumerate(b):
            if y < x and len(sequences[j]) > len(best):
                best = sequences[j]
            elif y == x and len(best) + 1 > len(sequences[j]):
                sequences[j] = best + (x,)
    return max(sequences, key=len, default=())


def inversions(a):
    ranks = {x: i + 1 for i, x in enumerate(sorted(set(a)))}
    tree = [0] * (len(ranks) + 1)
    answer = 0
    for x in reversed(a):
        i = ranks[x] - 1
        while i:
            answer += tree[i]
            i -= i & -i
        i = ranks[x]
        while i < len(tree):
            tree[i] += 1
            i += i & -i
    return answer


def components(grid):
    r, c = len(grid), len(grid[0])
    seen = set()
    answer = 0
    for i in range(r):
        for j in range(c):
            if grid[i][j] == '0' or (i, j) in seen:
                continue
            answer += 1
            seen.add((i, j))
            q = [(i, j)]
            for x, y in q:
                for a, b in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]:
                    if 0 <= a < r and 0 <= b < c and grid[a][b] != '0' and (a, b) not in seen:
                        seen.add((a, b))
                        q.append((a, b))
    return answer


def postfix(text):
    assert text.strip().endswith('@')
    expression = text.strip()[:-1]
    tokens = re.findall(r'\d+|[+*/-]', expression)
    assert re.sub(r'\d+|[+*/-]|\s+', '', expression) == ''
    stack = []
    for token in tokens:
        if token.isdigit():
            stack.append(int(token))
        else:
            assert len(stack) >= 2
            b, a = stack.pop(), stack.pop()
            if token == '+':
                value = a + b
            elif token == '-':
                value = a - b
            elif token == '*':
                value = a * b
            else:
                assert b and a % b == 0
                value = a // b
            stack.append(value)
        assert abs(stack[-1]) <= 2 ** 64
    assert len(stack) == 1
    return stack[0]


@lru_cache(maxsize=50)
def blah(a):
    # A priority queue supplies an independent ordering and duplicate check.
    heap = [a]
    values = array('Q')
    previous = -1
    while len(values) < 1000000:
        x = heappop(heap)
        if x == previous:
            continue
        values.append(x)
        previous = x
        heappush(heap, 2 * x + 1)
        heappush(heap, 3 * x + 1)
    return values


def dijkstra(graph, start):
    d = [math.inf] * len(graph)
    d[start] = 0
    heap = [(0, start)]
    while heap:
        distance, u = heappop(heap)
        if distance != d[u]:
            continue
        for v, w in graph[u]:
            if distance + w < d[v]:
                d[v] = distance + w
                heappush(heap, (d[v], v))
    return d


def euclidean_graph(text):
    v = list(map(int, text.split()))
    n = v[0]
    coordinates = list(zip(v[1:2*n+1:2], v[2:2*n+1:2]))
    m = v[2*n+1]
    graph = [[] for _ in range(n)]
    for a, b in zip(v[2*n+2:2*n+2+2*m:2], v[2*n+3:2*n+2+2*m:2]):
        a -= 1
        b -= 1
        w = math.dist(coordinates[a], coordinates[b])
        graph[a].append((b, w))
        graph[b].append((a, w))
    return graph, v[-2] - 1, v[-1] - 1


def cow_tour(text):
    t = text.split()
    n = int(t[0])
    coordinates = list(zip(map(int, t[1:2*n+1:2]), map(int, t[2:2*n+1:2])))
    matrix = t[2*n+1:]
    graph = [[] for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j and matrix[i][j] == '1':
                graph[i].append((j, math.dist(coordinates[i], coordinates[j])))
    distances = [dijkstra(graph, i) for i in range(n)]
    eccentricity = [max(x for x in d if math.isfinite(x)) for d in distances]
    original = max(eccentricity)
    bridge = min((eccentricity[i] + math.dist(coordinates[i], coordinates[j]) + eccentricity[j]
                  for i in range(n) for j in range(i) if not math.isfinite(distances[i][j])), default=original)
    return max(original, bridge)


def transfer_cost(text):
    v = list(map(int, text.split()))
    n, m = v[:2]
    graph = [[] for _ in range(n)]
    for i in range(m):
        a, b, z = v[2+3*i:5+3*i]
        graph[a-1].append((b-1, z))
        graph[b-1].append((a-1, z))
    start, end = v[-2]-1, v[-1]-1
    with localcontext() as ctx:
        ctx.prec = 90
        d = [Decimal(0)] * n
        d[start] = Decimal(1)
        heap = [(-d[start], start)]
        while heap:
            negative, u = heappop(heap)
            probability = -negative
            if probability != d[u]:
                continue
            if u == end:
                return Decimal(100) / probability
            for target, fee in graph[u]:
                p = probability * Decimal(100 - fee) / 100
                if p > d[target]:
                    d[target] = p
                    heappush(heap, (-p, target))
    raise ValueError('unreachable transfer target')


def black_white_moves(n):
    a = list('o' * n + '*' * n + '--')
    answer = ['step 0:' + ''.join(a)]
    gap = 2 * n
    def move(source):
        nonlocal gap
        source -= 1
        a[gap:gap+2] = a[source:source+2]
        a[source:source+2] = ['-', '-']
        gap = source
        answer.append(f'step{len(answer):2d}:' + ''.join(a))
    for k in range(n, 4, -1):
        move(k)
        move(2*k-1)
    for k in [4, 8, 2, 7, 1]:
        move(k)
    return '\n'.join(answer)


def euler(text):
    v = list(map(int, text.split()))
    n, m = v[:2]
    graph = [[] for _ in range(n)]
    for i, (a, b) in enumerate(zip(v[2::2], v[3::2])):
        graph[a-1].append((b-1, i))
        graph[b-1].append((a-1, i))
    odd = [i for i in range(n) if len(graph[i]) % 2]
    start = odd[0] if odd else next(i for i in range(n) if graph[i])
    used = [False] * m
    stack, path = [start], []
    while stack:
        u = stack[-1]
        while graph[u] and used[graph[u][-1][1]]:
            graph[u].pop()
        if not graph[u]:
            path.append(stack.pop()+1)
        else:
            target, edge = graph[u].pop()
            used[edge] = True
            stack.append(target)
    assert all(used)
    return path[::-1]


def solve(pid, text):
    t = text.split()
    if pid == 3973:
        return '\n'.join(str(edit_distance(a, b)) for a, b in zip(t[1::2], t[2::2]))
    if pid == 3974:
        n, k = map(int, t[:2])
        best = {0: 0}
        for x in map(int, t[2:]):
            updated = best.copy()
            for r, total in best.items():
                remainder = (r + x) % k
                updated[remainder] = max(updated.get(remainder, -1), total+x)
            best = updated
        return str(best[0])
    if pid == 3975:
        values = []
        for n, k in zip(map(int, t[::2]), map(int, t[1::2])):
            moves = 0
            while sum(math.comb(moves, j) for j in range(1, min(k, moves)+1)) < n:
                moves += 1
            values.append(str(moves))
        return '\n'.join(values)
    if pid in [3976, 3977, 3980]:
        v = list(map(int, t));i = 1;answer = []
        while i < len(v):
            n = v[i];a = v[i+1:i+1+n];i += n+1
            if pid == 3976:
                previous, current = 0, 0
                for x in a:
                    previous, current = current, max(current, previous+x)
                result = current
            elif pid == 3977:
                buy1 = buy2 = -10**30;sell1 = sell2 = 0
                for x in a:
                    buy1 = max(buy1, -x)
                    sell1 = max(sell1, buy1+x)
                    buy2 = max(buy2, sell1-x)
                    sell2 = max(sell2, buy2+x)
                result = sell2
            else:
                left = [];ending = best = a[0]
                for index, x in enumerate(a):
                    if index:ending = max(x, ending+x);best = max(best, ending)
                    left.append(best)
                ending = best = a[-1];result = -10**30
                for index in range(n-1, 0, -1):
                    if index < n-1:ending = max(a[index], ending+a[index]);best = max(best, ending)
                    result = max(result, left[index-1]+best)
            answer.append(str(result))
        return '\n'.join(answer)
    if pid == 3978:
        return '\n'.join(str(sum(partitions(int(a), j) for j in range(1, min(int(a), int(b))+1))) for a,b in zip(t[1::2],t[2::2]))
    if pid == 3979:return str(partitions(*map(int,t)))
    if pid == 3981:
        v = list(map(int,t));n = v[0];b = v[n+2:];sequence = lcis(v[1:n+1],b)
        return str(len(sequence))+'\n'+' '.join(map(str,sequence))
    if pid == 3982:return str(int(t[0])*int(t[1]))
    if pid == 3983:return '\n'.join(map(str,divmod(int(t[0]),int(t[1]))))
    if pid == 3984:
        base = int(t[0]);digits = '0123456789ABCDEF';value = t[1].upper()
        for step in range(31):
            if value == value[::-1]:return str(step)
            if step == 30:break
            number = int(value,base)+int(value[::-1],base);value = ''
            while number:number,d = divmod(number,base);value = digits[d]+value
            value = value or '0'
        return 'Impossible'
    if pid in [3985,3986,4003]:return str(inversions(list(map(int,t[1:]))))
    if pid == 3987:
        x,y,z = map(int,t);adults = [1]*(z+1)
        for month in range(x+2,z+1):adults[month] = adults[month-1]+y*adults[month-x-2]
        return str(adults[z])
    if pid == 3988:
        n = int(t[0]);even,odd = 8,1
        for _ in range(n-1):even,odd = (9*even+odd)%12345,(even+9*odd)%12345
        return str(even)
    if pid == 3989:
        n,m,x,y = map(int,t);blocked = {(x,y)}|{(x+a,y+b) for a,b in [(1,2),(1,-2),(-1,2),(-1,-2),(2,1),(2,-1),(-2,1),(-2,-1)]}
        d = [[0]*(m+1) for _ in range(n+1)]
        for i in range(n+1):
            for j in range(m+1):
                if (i,j) in blocked:continue
                d[i][j] = 1 if i==j==0 else (d[i-1][j] if i else 0)+(d[i][j-1] if j else 0)
        return str(d[n][m])
    if pid == 3990:
        n,k = map(int,t);d = [1]+[0]*k
        for _ in range(n):d = [0]+[d[j-1]+j*d[j] for j in range(1,k+1)]
        return str(d[k])
    if pid == 3991:
        n = int(t[0]);d = [1]*(n+1)
        for i in range(1,n+1):d[i] = 1+sum(d[1:i//2+1])
        return str(d[n])
    if pid == 3992:
        n,k = map(int,t)
        return '\n'.join(''.join(f'{x:3d}' for x in row) for row in combinations(range(1,n+1),k))
    if pid == 3993:
        n = int(t[0]);answer = []
        def visit(left,minimum,path):
            if not left:
                if len(path)>1:answer.append(str(n)+'='+'+'.join(map(str,path)))
                return
            for x in range(minimum,left+1):visit(left-x,x,path+[x])
        visit(n,1,[])
        return '\n'.join(answer)
    if pid == 3994:
        a = list(map(int,t[1:]));order = sorted(range(len(a)),key=lambda i:(a[i],i));wait = sum(a[i]*(len(a)-j-1) for j,i in enumerate(order))
        with localcontext() as ctx:ctx.prec = 60;mean = Decimal(wait)/len(a)
        return ' '.join(str(i+1) for i in order)+f'\n{mean:.2f}'
    if pid == 3995:
        n = int(t[0]);a = list(map(int,t[1:]));average = sum(a)//n;prefix = answer = 0
        for x in a[:-1]:prefix += x-average;answer += prefix!=0
        return str(answer)
    if pid == 3996:
        digits = t[0];remove = int(t[1]);stack = []
        for ch in digits:
            while remove and stack and stack[-1]>ch:stack.pop();remove -= 1
            stack.append(ch)
        if remove:stack = stack[:-remove]
        return ''.join(stack).lstrip('0') or '0'
    if pid == 3997:
        tails = []
        for x in map(int,t):
            j = bisect_left(tails,x)
            if j==len(tails):tails.append(x)
            else:tails[j] = x
        return str(len(tails))
    if pid in [3998,3999]:
        a = sorted(zip(map(int,t[1::2]),map(int,t[2::2])),key=lambda p:p[1]);answer = 0;last = -math.inf
        for start,end in a:
            if (start>=last if pid==3998 else start>last):last = end;answer += 1
        return str(answer)
    if pid == 4000:
        n = 1<<int(t[0])
        return '\n'.join(' '.join(str((i^j)+1) for j in range(n)) for i in range(n))
    if pid == 4001:
        b,p,k = map(int,t)
        return f'{b}^{p} mod {k}={pow(b,p,k)}'
    if pid == 4002:return black_white_moves(int(t[0]))
    if pid in [4004,4010]:
        n,m = map(int,t[:2]);grid = t[2:] if pid==4004 else [''.join(t[2+i*m:2+(i+1)*m]) for i in range(n)]
        return str(components(grid))
    if pid == 4005:
        d = {(1,1):0};q = deque([(1,1)]);moves = [(a,b) for a,b in [(1,2),(2,1),(2,2)] for a in [a,-a] for b in [b,-b]]
        while q:
            x,y = q.popleft()
            for a,b in moves:
                target = x+a,y+b
                if all(1<=z<=100 for z in target) and target not in d:d[target] = d[x,y]+1;q.append(target)
        return '\n'.join(str(d[int(x),int(y)]) for x,y in zip(t[::2],t[1::2]))
    if pid == 4006:return str(postfix(text))
    if pid == 4007:
        a,b,n = map(int,t)
        return '\n'.join(f'{i%a+1} {i%b+1}' for i in range(n))
    if pid == 4008:return '\n'.join(str(blah(int(a))[int(n)-1]) for a,n in zip(t[::2],t[1::2]))
    if pid == 4009:
        n,m = map(int,t);people = list(range(1,n+1));index = 0;answer = []
        while people:index = (index+m-1)%len(people);answer.append(people.pop(index))
        return ' '.join(map(str,answer))
    if pid == 4011:
        v = list(map(int,t));n,m = v[:2];children = defaultdict(list);nodes = {1} if n==1 else set();nonroots = set()
        for a,b in zip(v[2::2],v[3::2]):children[a].append(b);nodes.update([a,b]);nonroots.add(b)
        root = next(iter(nodes-nonroots));best = min(nodes,key=lambda x:(-len(children[x]),x))
        return f'{root}\n{best}\n'+' '.join(map(str,sorted(children[best])))
    if pid == 4012:
        words = sorted(set(t));nodes = 1;previous = ''
        for word in words:
            shared = 0
            while shared<min(len(previous),len(word)) and previous[shared]==word[shared]:shared += 1
            nodes += len(word)-shared;previous = word
        return str(nodes)
    if pid == 4013:
        v = list(map(int,t));n = v[0];graph = [[] for _ in range(n)];population = v[1::3]
        for i in range(n):
            for j in v[2+3*i:4+3*i]:
                if j:graph[i].append((j-1,1));graph[j-1].append((i,1))
        return str(min(sum(x*p for x,p in zip(dijkstra(graph,i),population)) for i in range(n)))
    if pid == 4014:
        pre,inside = t
        def visit(pre,inside):
            if not pre:return ''
            k = inside.index(pre[0]);return visit(pre[1:k+1],inside[:k])+visit(pre[k+1:],inside[k+1:])+pre[0]
        return visit(pre,inside)
    if pid == 4015:
        it = iter(t[0])
        def visit():
            ch = next(it)
            if ch=='.':return '',''
            li,lp = visit();ri,rp = visit();return li+ch+ri,lp+rp+ch
        inside,post = visit()
        return inside+'\n'+post
    if pid == 4016:return ' '.join(map(str,euler(text)))
    if pid == 4017:
        graph,start,end = euclidean_graph(text)
        return f'{dijkstra(graph,start)[end]:.2f}'
    if pid == 4018:return f'{cow_tour(text):.6f}'
    if pid == 4019:return f'{transfer_cost(text):.8f}'
    if pid == 4020:
        v = list(map(int,t));n,p,m = v[:3];cows = Counter(x-1 for x in v[3:3+n]);graph = [[] for _ in range(p)]
        for a,b,w in zip(v[3+n::3],v[4+n::3],v[5+n::3]):graph[a-1].append((b-1,w));graph[b-1].append((a-1,w))
        total = [0]*p
        for start,count in cows.items():total = [x+count*y for x,y in zip(total,dijkstra(graph,start))]
        return str(min(total))
    if pid == 4021:
        it = iter(map(int,t));n,m = next(it),next(it);parent = list(range(n+1));size = [1]*(n+1)
        def find(x):
            while parent[x]!=x:parent[x] = parent[parent[x]];x = parent[x]
            return x
        for _ in range(m):
            a,b = find(next(it)),find(next(it))
            if a!=b:
                if size[a]<size[b]:a,b = b,a
                parent[b] = a;size[a] += size[b]
        q = next(it)
        return '\n'.join('Yes' if find(next(it))==find(next(it)) else 'No' for _ in range(q))
    if pid == 4022:
        n,m = map(int,t[:2]);graph = defaultdict(list)
        # Search existing connectivity before inserting each edge, independently
        # of the reference's disjoint-set implementation.
        for step,(a,b,kind) in enumerate(zip(t[2::3],t[3::3],t[4::3]),1):
            x,y = int(a)-1,int(b)-1;u = x*n+y;target = (x+(kind=='D'))*n+y+(kind=='R')
            seen = {u};q = [u]
            for v in q:
                if v==target:return str(step)
                for w in graph[v]:
                    if w not in seen:seen.add(w);q.append(w)
            graph[u].append(target);graph[target].append(u)
        return 'draw'
    raise ValueError(pid)


def equivalent(pid, text, output):
    try:
        tokens = output.split()
        if pid == 3981:
            v = list(map(int,text.split()));n = v[0];a,b = v[1:n+1],v[n+2:];length = int(tokens[0]);s = list(map(int,tokens[1:]))
            def subsequence(seq,source):
                it = iter(source)
                return all(any(y==x for y in it) for x in seq)
            return len(s)==length==len(lcis(a,b)) and all(x<y for x,y in zip(s,s[1:])) and subsequence(s,a) and subsequence(s,b)
        if pid == 3994:
            a = list(map(int,text.split()[1:]));n = len(a);order = list(map(int,tokens[:n]));value = Decimal(tokens[n])
            optimal = sorted(a);wait = sum(x*(n-i-1) for i,x in enumerate(optimal))
            actual = sum(a[x-1]*(n-i-1) for i,x in enumerate(order)) if set(order)==set(range(1,n+1)) else -1
            return len(tokens)==n+1 and value.is_finite() and actual==wait and abs(value-Decimal(wait)/n)<=Decimal('.00500001')
        if pid == 4000:
            n = 1<<int(text);v = list(map(int,tokens))
            if len(v)!=n*n:return False
            schedule = {};expected = set(range(1,n+1))
            for i in range(n):
                row = v[i*n:(i+1)*n]
                if set(row)!=expected or row[0] in schedule:return False
                schedule[row[0]] = row[1:]
            return set(schedule)==expected and all(schedule[schedule[i][d]][d]==i for i in expected for d in range(n-1))
        if pid == 4002:
            n = int(text);states = []
            for i,line in enumerate(output.splitlines()):
                m = re.fullmatch(r'step\s*(\d+):([o*\-]+)',line.strip())
                if not m or int(m[1])!=i or len(m[2])!=2*n+2 or m[2].count('o')!=n or m[2].count('*')!=n or m[2].count('-')!=2 or '--' not in m[2]:return False
                states.append(m[2])
            if not states or states[0]!='o'*n+'*'*n+'--':return False
            for before,after in zip(states,states[1:]):
                destination = before.index('--');source = after.index('--')
                if abs(destination-source)<3 or '-' in before[source:source+2]:return False
                a = list(before);a[destination:destination+2] = a[source:source+2];a[source:source+2] = ['-','-']
                if ''.join(a)!=after:return False
            final = states[-1]
            if not (final.startswith('--') or final.endswith('--')):return False
            pieces = final.replace('--','')
            return all(a!=b for a,b in zip(pieces,pieces[1:]))
        if pid == 4016:
            v = list(map(int,text.split()));n,m = v[:2];path = list(map(int,tokens))
            edges = Counter(tuple(sorted([a,b])) for a,b in zip(v[2::2],v[3::2]));used = Counter(tuple(sorted([a,b])) for a,b in zip(path,path[1:]))
            return len(path)==m+1 and all(1<=x<=n for x in path) and edges==used
        if pid in [4017,4018,4019]:
            if len(tokens)!=1:return False
            value = Decimal(tokens[0])
            if not value.is_finite():return False
            if pid == 4019:opt = transfer_cost(text);tolerance = max(Decimal('1e-7'),abs(opt)*Decimal('1e-9'))
            else:
                if pid==4017:g,s,t = euclidean_graph(text);opt = Decimal(str(dijkstra(g,s)[t]));tolerance = Decimal('.0050001')
                else:opt = Decimal(str(cow_tour(text)));tolerance = max(Decimal('1e-6'),abs(opt)*Decimal('1e-9'))
            return abs(value-opt)<=tolerance
    except (AssertionError,ValueError,IndexError,KeyError,ArithmeticError,StopIteration):
        return False
    raise ValueError(pid)
