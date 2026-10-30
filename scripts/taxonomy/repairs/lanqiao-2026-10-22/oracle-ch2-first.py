"""Independent arithmetic, closure, and board oracles for ordered problems 16--23."""
from collections import defaultdict, deque
from decimal import Decimal, localcontext, ROUND_HALF_UP
from fractions import Fraction
import re


def buying_input(text, normalize=False):
    t = list(map(int, text.split())); n = t[0]; p = 1; sets = []
    assert 1 <= n <= 300
    for _ in range(n):
        m = t[p]; p += 1; values = t[p:p + m]; p += m
        assert len(values) == m and 1 <= m <= n and all(1 <= v <= n for v in values)
        if normalize: values = list(dict.fromkeys(values))
        assert len(set(values)) == len(values), 'duplicate set elements'
        sets.append(values)
    weights = t[p:]
    assert len(weights) == n and all(abs(w) <= 10**6 for w in weights)
    owner = [-1] * n
    def augment(u, seen):
        for value in sets[u]:
            v = value - 1
            if v in seen: continue
            seen.add(v)
            if owner[v] < 0 or augment(owner[v], seen): owner[v] = u; return True
        return False
    assert all(augment(u, set()) for u in range(n)), 'Hall condition fails'
    return sets, weights, owner


def buying_brute(sets, weights):
    masks = [sum(1 << (v - 1) for v in row) for row in sets]
    unions = [0] * (1 << len(sets)); costs = [0] * len(unions); best = 0
    for mask in range(1, len(unions)):
        bit = mask & -mask; i = bit.bit_length() - 1; other = mask ^ bit
        unions[mask] = unions[other] | masks[i]; costs[mask] = costs[other] + weights[i]
        if unions[mask].bit_count() == mask.bit_count(): best = min(best, costs[mask])
    return best


def buying(text, normalize=False):
    sets, weights, owner = buying_input(text, normalize)
    n = len(sets)
    reach = [(1 << u) | sum(1 << v for v in {owner[x - 1] for x in row}) for u, row in enumerate(sets)]
    # Bitset transitive closure, then collapse mutually dependent sets.
    for k in range(n):
        bit = 1 << k
        for u in range(n):
            if reach[u] & bit: reach[u] |= reach[k]
    component = [-1] * n; members = []
    for u in range(n):
        if component[u] >= 0: continue
        group = [v for v in range(n) if reach[u] >> v & 1 and reach[v] >> u & 1]
        for v in group: component[v] = len(members)
        members.append(group)
    costs = [sum(weights[u] for u in group) for group in members]
    count = len(costs); source = count; sink = count + 1; nodes = count + 2
    capacity = [[0] * nodes for _ in range(nodes)]; adjacent = [set() for _ in range(nodes)]
    def edge(u, v, amount):
        if u == v: return
        capacity[u][v] += amount; adjacent[u].add(v); adjacent[v].add(u)
    infinity = sum(map(abs, weights)) + 1
    for i, cost in enumerate(costs):
        if cost < 0: edge(source, i, -cost)
        else: edge(i, sink, cost)
        dependencies = {component[owner[x - 1]] for u in members[i] for x in sets[u]}
        for j in dependencies: edge(i, j, infinity)
    # FIFO push-relabel, independent of the C++ reference's Dinic implementation.
    height = [0] * nodes; excess = [0] * nodes; height[source] = nodes
    active = deque(); scheduled = [False] * nodes
    def schedule(u):
        if u not in (source, sink) and excess[u] > 0 and not scheduled[u]:
            active.append(u); scheduled[u] = True
    for v in list(adjacent[source]):
        amount = capacity[source][v]
        capacity[source][v] -= amount; capacity[v][source] += amount
        excess[v] += amount; excess[source] -= amount; schedule(v)
    while active:
        u = active.popleft(); scheduled[u] = False
        while excess[u] > 0:
            for v in adjacent[u]:
                if capacity[u][v] and height[u] == height[v] + 1:
                    amount = min(excess[u], capacity[u][v])
                    capacity[u][v] -= amount; capacity[v][u] += amount
                    excess[u] -= amount; excess[v] += amount; schedule(v)
                    if not excess[u]: break
            if excess[u]: height[u] = 1 + min(height[v] for v in adjacent[u] if capacity[u][v])
    return sum(min(0, w) for w in costs) + excess[sink]


def cars_input(text):
    t = list(map(int, text.split())); n = t[0]
    assert 1 <= n <= 100000 and len(t) == 1 + 4 * n
    cars = [t[1 + 4*i:5 + 4*i] for i in range(n)]
    assert all(1 <= v <= 10000 and 1 <= c <= 100000 and 0 <= l <= 100000 and 0 <= r <= 100000 for v, c, l, r in cars)
    return cars


def cars(text):
    grouped = defaultdict(list)
    for i, (v, c, l, r) in enumerate(cars_input(text)):
        grouped[c + l + r].append((i + 1, v, l, l + c))
    optimum = 0; answer = []
    for total, edges in grouped.items():
        dp = {0: (0, None)}
        for i, value, start, end in edges:
            if start not in dp: continue
            candidate = (dp[start][0] + value, (i, dp[start][1]))
            if end not in dp or candidate[0] > dp[end][0]: dp[end] = candidate
        if total in dp and dp[total][0] > optimum:
            optimum = dp[total][0]; node = dp[total][1]; answer = []
            while node is not None: answer.append(node[0]); node = node[1]
            answer.reverse()
    return optimum, answer


def check_cars(text, output, allow_value=True):
    a = cars_input(text); raw = list(map(int, output.split())); k = raw[0]
    assert 0 <= k <= len(a) and len(raw) in ([k + 1, k + 2] if allow_value else [k + 1])
    ids = raw[1:1 + k]
    assert ids == sorted(set(ids)) and all(1 <= i <= len(a) for i in ids)
    passengers = sum(a[i-1][1] for i in ids); prefix = value = 0
    for i in ids:
        v, c, l, r = a[i-1]
        assert l == prefix and r == passengers - prefix - c
        value += v; prefix += c
    if len(raw) == k + 2: assert raw[-1] == value
    assert value == cars(text)[0]
    return value


def board_input(text):
    t = list(map(int, text.split())); n, m = t[:2]; cells = n * m
    assert 1 <= n <= 300 and 1 <= m <= 300 and len(t) == 4 + 2*cells
    colors = t[2:2+cells]; symbols = t[2+cells:2+2*cells]; x, y = t[-2:]
    assert all(0 <= c <= 10**9 for c in colors) and all(-1 <= c <= 10**9 for c in symbols)
    assert 1 <= x <= n and 1 <= y <= m and symbols[(x-1)*m+y-1] >= 0
    return n, m, colors, symbols, (x-1)*m+y-1


def spiral_rank(dr, dc):
    d = max(abs(dr), abs(dc))
    if not d: return 0
    # Explicit perimeter order: top (without top-left), right, bottom, left.
    if dr == -d and dc > -d: offset = dc + d - 1
    elif dc == d: offset = 2*d + dr + d - 1
    elif dr == d: offset = 4*d + d - dc - 1
    else: offset = 6*d + d - dr - 1
    return (2*d-1)**2 + offset


def board_brute(text):
    n, m, colors, symbols, first = board_input(text)
    queue = deque([first]); live = symbols[:]; live[first] = -1; result = 0
    # Walk actual square-spiral steps, independent of the closed-form numbering.
    radius = max(n, m); steps = {(0, 0): 0}; dr = dc = value = 0
    directions = [(-1, 0), (0, 1), (1, 0), (0, -1)]
    length = 1; direction = 0
    while len(steps) < (2*radius+1)**2:
        for _ in range(2):
            dy, dx = directions[direction % 4]; direction += 1
            for _ in range(length):
                dr += dy; dc += dx; value += 1; steps[dr, dc] = value
        length += 1
    while queue:
        center = queue.popleft(); old = colors[center]; new = symbols[center]
        if not old or old == new: continue
        touched = [i for i, c in enumerate(colors) if c == old]
        touched.sort(key=lambda i: steps[i//m-center//m, i%m-center%m])
        for i in touched:
            colors[i] = new; result += 1
            if live[i] >= 0: queue.append(i); live[i] = -1
    return result


def board(text):
    n, m, colors, symbols, first = board_input(text)
    buckets = {}; by_color = {}; cell_bucket = []; bucket_color = {}; live_symbols = {}
    for i, color in enumerate(colors):
        if color not in by_color:
            g = len(buckets); by_color[color] = g
            buckets[g] = set(); bucket_color[g] = color; live_symbols[g] = []
        g = by_color[color]; cell_bucket.append(g); buckets[g].add(i)
        if symbols[i] >= 0: live_symbols[g].append(i)
    queue = deque([first]); active = [v >= 0 for v in symbols]; active[first] = False; result = 0
    while queue:
        center = queue.popleft(); source = cell_bucket[center]; old = bucket_color[source]; new = symbols[center]
        if not old or old == new: continue
        result += len(buckets[source])
        found = [i for i in live_symbols[source] if active[i]]
        found.sort(key=lambda i: spiral_rank(i//m-center//m, i%m-center%m))
        live_symbols[source] = []
        for i in found: queue.append(i); active[i] = False
        del by_color[old]
        if new not in by_color:
            bucket_color[source] = new; by_color[new] = source
        else:
            destination = by_color[new]; remaining = live_symbols[destination]
            # Relabel each cell of the smaller group; each cell moves O(log(n*m)) times.
            if len(buckets[source]) < len(buckets[destination]): source, destination = destination, source
            for cell in buckets[destination]: cell_bucket[cell] = source
            buckets[source].update(buckets.pop(destination))
            live_symbols.pop(destination); bucket_color.pop(destination)
            live_symbols[source] = remaining; bucket_color[source] = new; by_color[new] = source
    return result


def maze_input(text):
    t = list(map(int, text.split())); n = t[0]; p = 1
    assert 1 <= n <= 100000 and len(t) == 1 + 2*(n-1) + 2*n
    graph = [[] for _ in range(n)]
    for _ in range(n-1):
        u, v = t[p]-1, t[p+1]-1; p += 2
        assert 0 <= u < n and 0 <= v < n and u != v
        graph[u].append(v); graph[v].append(u)
    x = t[p::2]; y = t[p+1::2]
    assert all(v >= 0 for v in x+y) and 1 <= sum(x) <= 10**6 and 1 <= sum(y) <= 10**6
    parent = [-1]*n; parent[0] = 0; order = [0]
    for u in order:
        for v in graph[u]:
            if v == parent[u]: continue
            assert parent[v] < 0, 'input is not a tree'
            parent[v] = u; order.append(v)
    assert len(order) == n
    return graph, x, y, parent, order


def maze(text):
    graph, x, y, parent, order = maze_input(text); n = len(graph)
    sx = x[:]; size = [1]*n; total_x = sum(x); total_y = sum(y)
    for u in reversed(order[1:]): p = parent[u]; sx[p] += sx[u]; size[p] += size[u]
    numerator = sum(size[u]*sx[u]*y[parent[u]] + (n-size[u])*(total_x-sx[u])*y[u] for u in order[1:])
    return Fraction(numerator, total_x*total_y)


def money(text):
    t = text.split(); n = int(t[0]); assert 0 <= n < 100 and len(t) == 1+3*n
    assert all(1 <= len(t[1+3*i]) <= 100 and -2**31 <= int(t[3+3*i]) < 2**31 for i in range(n))
    prices = [Decimal(t[2+3*i]) for i in range(n)]; assert all(p.is_finite() for p in prices)
    with localcontext() as context:
        context.prec = 100
        value = sum((p*int(t[3+3*i]) for i, p in enumerate(prices)), Decimal(0))
        rounded = value.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        if rounded.is_zero(): rounded = abs(rounded)
        return format(rounded, '.6f')


def students(text):
    t = text.split(); n = int(t[0]); assert 0 <= n < 1000 and len(t) == 1+4*n
    rows = [t[1+4*i:5+4*i] for i in range(n)]
    assert all(1 <= len(r[0]) <= 20 and 1 <= len(r[1]) <= 20 and all(-2**31 <= int(s) < 2**31 for s in r[2:]) for r in rows)
    return '\n'.join(' '.join(row) for row in sorted(rows, key=lambda row: int(row[3])))


def sampling_input(text):
    t = text.split(); n, k = map(int, t[:2]); words = t[2:]
    assert 1 <= k <= n <= 2000 and len(words) == n and all(re.fullmatch('[a-z]{1,500}', w) for w in words)
    return words, k


def sampling(text):
    words, limit = sampling_input(text); words.sort()
    # Cartesian tree of adjacent LCPs, unlike the reference's compressed trie.
    def common(a, b):
        i = 0
        while i < min(len(a), len(b)) and a[i] == b[i]: i += 1
        return i
    gaps = [common(a, b) for a, b in zip(words, words[1:])]
    n = len(words); left = [-1]*(n-1); right = [-1]*(n-1); stack = []
    for i, depth in enumerate(gaps):
        previous = -1
        while stack and gaps[stack[-1]] > depth: previous = stack.pop()
        if stack: right[stack[-1]] = i
        left[i] = previous; stack.append(i)
    if n == 1: return 0
    root = stack[0]; order = [root]
    for u in order:
        if left[u] >= 0: order.append(left[u])
        if right[u] >= 0: order.append(right[u])
    dp = {}
    for u in reversed(order):
        a = dp.pop(left[u]) if left[u] >= 0 else [0, 0]
        b = dp.pop(right[u]) if right[u] >= 0 else [0, 0]
        count = min(limit, len(a)+len(b)-2); merged = [-10**30]*(count+1)
        for i, x in enumerate(a):
            for j in range(min(len(b)-1, count-i)+1): merged[i+j] = max(merged[i+j], x+b[j]+gaps[u]*i*j)
        dp[u] = merged
    return dp[root][limit]


def binary_string(text):
    t = text.split(); assert len(t) == 1
    n = int(t[0]); assert 0 <= n <= 19; value = '0'
    for _ in range(n): value = ''.join('1' if c == '0' else '01' for c in value)
    return value


def solve(pid, text):
    if pid == 4087: return str(buying(text))
    if pid == 4088:
        optimum, ids = cars(text)
        return str(len(ids)) + '\n' + ' '.join(map(str, ids))
    if pid == 4089: return str(board(text))
    if pid == 4090:
        value = maze(text)
        with localcontext() as context:
            context.prec = 60
            return format(Decimal(value.numerator)/Decimal(value.denominator), '.20f')
    if pid == 4091: return money(text)
    if pid == 4092: return students(text)
    if pid == 4093: return str(sampling(text))
    if pid == 4094: return binary_string(text)
    raise ValueError(pid)
