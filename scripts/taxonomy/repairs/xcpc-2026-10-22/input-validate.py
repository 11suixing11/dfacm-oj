"""Validate XCPC input structure and stated constraints in the live DAG order.

Pass a fresh inventory/data snapshot with --root. This reads only that snapshot;
it never changes tests or interprets a reference program's AC as input validity.
The output report contains names/hashes/issues, never full inputs or answers.
Remote judge inputs are explicitly outside this local snapshot.
"""
from pathlib import Path
from collections import Counter, deque
from decimal import Decimal, InvalidOperation
import argparse, gzip, hashlib, json, math, re, sys

sys.stdout.reconfigure(encoding='utf-8')


class InvalidInput(Exception):
    pass


def require(condition, message):
    if not condition:
        raise InvalidInput(message)


class Tokens:
    def __init__(self, data):
        require(not data.startswith(b'\xef\xbb\xbf'), 'UTF-8 BOM')
        require(b'\0' not in data, 'NUL byte')
        try:
            self.text = data.decode('ascii')
        except UnicodeDecodeError:
            raise InvalidInput('non-ASCII input')
        self.tokens = self.text.split()
        self.pos = 0

    def word(self, chars=None, lo=1, hi=None):
        require(self.pos < len(self.tokens), 'missing token at position ' + str(self.pos + 1))
        value = self.tokens[self.pos]
        self.pos += 1
        require(len(value) >= lo and (hi is None or len(value) <= hi), 'string length outside range at token ' + str(self.pos))
        if chars is not None:
            require(set(value) <= set(chars), 'invalid string alphabet at token ' + str(self.pos))
        return value

    def integer(self, lo=None, hi=None):
        value = self.word()
        require(re.fullmatch(r'[+-]?\d+', value) is not None, 'invalid integer at token ' + str(self.pos))
        value = int(value)
        require((lo is None or value >= lo) and (hi is None or value <= hi),
                f'integer outside [{lo}, {hi}] at token {self.pos}: {value}')
        return value

    def integers(self, count, lo=None, hi=None):
        return [self.integer(lo, hi) for _ in range(count)]

    def end(self):
        require(self.pos == len(self.tokens), f'unexpected trailing tokens: {len(self.tokens) - self.pos}')


class DSU:
    def __init__(self, n):
        self.parent = list(range(n + 1))
        self.size = [1] * (n + 1)

    def find(self, a):
        while a != self.parent[a]:
            self.parent[a] = self.parent[self.parent[a]]
            a = self.parent[a]
        return a

    def join(self, a, b):
        a, b = self.find(a), self.find(b)
        if a == b:
            return False
        if self.size[a] < self.size[b]:
            a, b = b, a
        self.parent[b] = a
        self.size[a] += self.size[b]
        return True


LOWER = 'abcdefghijklmnopqrstuvwxyz'
UPPER = LOWER.upper()
DIGITS = '0123456789'


def edges(t, n, m, weight=None, simple=True, connected=False, tree=False,
          distinct_ends=True, shared_seen=None):
    seen = shared_seen if shared_seen is not None else set()
    dsu = DSU(n)
    for _ in range(m):
        a, b = t.integer(1, n), t.integer(1, n)
        require(not distinct_ends or a != b, 'self-loop')
        key = (min(a, b), max(a, b))
        if simple:
            require(key not in seen, 'duplicate undirected edge')
            seen.add(key)
        joined = dsu.join(a, b)
        require(not tree or joined, 'tree contains a cycle')
        if weight:
            t.integer(*weight)
    require(not connected or dsu.size[dsu.find(1)] == n, 'graph is disconnected')
    return dsu


def balanced(s):
    depth = 0
    for c in s:
        depth += 1 if c == '(' else -1
        require(depth >= 0, 'bracket prefix has negative balance')
    require(depth == 0, 'unbalanced brackets')


def regex_grammar(s):
    # Empty strings are basic elements of the stated grammar; empty () is forbidden.
    position = 0
    def expression():
        nonlocal position
        sequence()
        while position < len(s) and s[position] == '|':
            position += 1
            sequence()
    def sequence():
        nonlocal position
        while position < len(s) and s[position] not in ')|':
            if s[position] == '(':
                position += 1
                require(position < len(s) and s[position] != ')', 'empty regex parentheses')
                expression()
                require(position < len(s) and s[position] == ')', 'unclosed regex parentheses')
                position += 1
            else:
                require(s[position] in LOWER, 'regex operator without operand')
                position += 1
            while position < len(s) and s[position] in '*+':
                position += 1
    expression()
    require(position == len(s), 'unexpected closing regex parenthesis')


def validate(pid, data):
    t = Tokens(data)
    if pid in (4909, 4876):
        pass  # These two remote tasks require no input.
    elif pid == 4836:
        sides = []
        for _ in range(3):
            raw = t.word()
            require(re.fullmatch(r'\d+(?:\.\d{1,2})?', raw), 'invalid triangle side format')
            value = Decimal(raw)
            require(0 < value <= 1000, 'triangle side outside range')
            sides.append(value)
        require(2 * max(sides) < sum(sides), 'sides do not form a triangle')
    elif pid == 4830:
        require(re.fullmatch(r'[1-9]\d\d\.\d', t.word()), 'expected a three-digit value with one decimal place')
    elif pid == 4903:
        n = t.integer(1, 10)
        for _ in range(2 * n):
            t.word('@-', n, n)
    elif pid == 4902:
        first = t.word('01', 3, 200)
        n = len(first)
        for _ in range(n - 1):
            t.word('01', n, n)
    elif pid == 4931:
        t.integers(14, 0, 9)
    elif pid == 5:
        n = t.integer(1, 999)
        # Processing times are nonnegative; the source gives no numeric upper bound.
        t.integers(2 * n, 0, 2 ** 63 - 1)
    elif pid == 3:
        n, h = t.integer(1, 30000), t.integer(0, 5000)
        for _ in range(h):
            b, e = t.integer(1, n), t.integer(1, n)
            require(b <= e, 'reversed interval')
            t.integer(0, e - b + 1)
    elif pid == 2:
        n = t.integer(1, 1000)
        for _ in range(n):
            s, f = t.integer(), t.integer()
            require(s < f, 'activity must start before finishing')
    elif pid in (3671, 3571, 3668):
        n = t.integer(3 if pid == 3671 else 1, 100)
        m = t.integer(0, n * (n - 1) // 2)
        if pid == 3671:
            t.integers(n, 1, 1000000)
        edges(t, n, m)
    elif pid == 3635:
        n = t.integer(2, 100)
        require(n % 2 == 0, 'square side must be even')
        t.integers(2, 1, n)
    elif pid == 3592:
        t.word(LOWER, 1, 1000)
    elif pid == 3555:
        n = t.integer(2, 200000)
        t.integers(n, 1, 1000)
    elif pid == 3656:
        n = t.integer(1, 1000)
        p = t.integer(0, n)
        incoming, outgoing = set(), set()
        for _ in range(p):
            a, b = t.integer(1, n), t.integer(1, n)
            require(a != b and a not in outgoing and b not in incoming, 'invalid pipe topology')
            outgoing.add(a)
            incoming.add(b)
            t.integer(1, 1000000)
    elif pid == 3604:
        n, m = t.integer(1, 50), t.integer(1, 50)
        require(max(n, m) >= 3, 'field cannot be cut into three nonempty parts')
        t.integers(n * m, 0, 100)
        t.integers(3, 0, 1000000)
    elif pid == 3587:
        n, k = t.integer(1, 8), t.integer(1, 8)
        for _ in range(n):
            value = t.word(DIGITS, k, k)
            require(int(value) > 0, 'initial number must be positive')
    elif pid == 3577:
        board = [t.word('.SAM', 8, 8) for _ in range(8)]
        require(board[0][7] == 'A' and board[7][0] == 'M', 'wrong player start positions')
        require(all(board[i][j] in '.S' for i in range(8) for j in range(8)
                    if (i, j) not in [(0, 7), (7, 0)]), 'extra player symbol')
    elif pid == 3461:
        k = t.integer(1, 2000)
        s = t.word(LOWER, 1, 100)
        count = Counter(s)
        for c in count:
            count[c] *= k
        n = t.integer(0, 20000)
        for _ in range(n):
            p, c = t.integer(1, 200000), t.word(LOWER, 1, 1)
            require(p <= count[c], 'deletion occurrence does not exist')
            count[c] -= 1
        require(sum(count.values()) > 0, 'all characters deleted')
    elif pid in (3460, 3582, 3589):
        t.word(LOWER, 1, {3460: 2000, 3582: 1000000, 3589: 100000}[pid])
    elif pid == 3399:
        t.word(DIGITS, 1, 30)
    elif pid in (3386, 3385):
        n = t.integer(2, 2000)
        seen = set()
        k = t.integer(0, min(100000, n * (n - 1) // 2))
        edges(t, n, k, shared_seen=seen)
        m = t.integer(0, min(100000, n * (n - 1) // 2))
        edges(t, n, m, shared_seen=seen)
    elif pid == 3330:
        t.integers(t.integer(1, 100000), -10000, 10000)
    elif pid == 3466:
        n = t.integer(1, 50)
        depth = 0
        for _ in range(n):
            command = t.word()
            require(command in ('cd', 'pwd'), 'unknown shell command')
            if command == 'pwd':
                continue
            path = t.word(LOWER + '/.', 1, 200)
            require('//' not in path and (path == '/' or not path.endswith('/')), 'invalid path slashes')
            if path.startswith('/'):
                depth = 0
                path = path[1:]
            if not path:
                continue
            for part in path.split('/'):
                if part == '..':
                    require(depth > 0, 'attempt to move above root')
                    depth -= 1
                else:
                    require(part and set(part) <= set(LOWER), 'invalid directory name')
                    depth += 1
    elif pid == 3275:
        t.integers(2 * t.integer(1, 100000), 1, 1000000000)
    elif pid == 3046:
        n = t.integer(1, 100000)
        require(len(set(t.integers(n, 1, n))) == n, 'not a permutation')
    elif pid == 3039:
        n = t.integer(1, 100000)
        a = t.integers(n, 1, 1000000000)
        require(all(a[i] <= a[i + 1] for i in range(n - 1)), 'stair heights decrease')
        m = t.integer(1, 100000)
        for _ in range(m):
            t.integer(1, n)
            t.integer(1, 1000000000)
    elif pid == 2836:
        n = t.integer(2, 300000)
        a = t.integers(n, -1000000000, 1000000000)
        require(len(set(a)) < n, 'no two trees have equal beauty')
    elif pid == 2824:
        n = t.integer(2, 200000)
        t.integer(1, n // 2)
        t.integers(n, 1, 1000000000)
    elif pid == 3473:
        n = t.integer(1, 100000)
        m = t.integer(0, n)
        pos, neg = Counter(), Counter()
        negative_count = 0
        for _ in range(n):
            raw = t.word()
            require(re.fullmatch(r'[+-]\d+', raw), 'suspect statement needs a sign')
            value = int(raw)
            require(1 <= abs(value) <= n, 'suspect index outside range')
            if value > 0:
                pos[value] += 1
            else:
                neg[-value] += 1
                negative_count += 1
        require(any(negative_count + pos[v] - neg[v] == m for v in range(1, n + 1)),
                'no suspect can give the stated truth count')
    elif pid == 3188:
        n, m = t.integer(2, 100000), t.integer(0, 100000)
        edges(t, n, m, (1, 10000))
        for _ in range(n):
            times = t.integers(t.integer(0, 100000), 0, 999999999)
            require(all(a < b for a, b in zip(times, times[1:])), 'arrival times are not strictly increasing')
    elif pid == 3103:
        n = t.integer(1, 100)
        a = t.integers(n, 0, 100000)
        for _ in range(2):
            r = t.integer(1, n)
            t.integer(1, a[r - 1] + 1)
    elif pid == 2785:
        t.word('+-', 1, 100000)
    elif pid == 2767:
        t.integer(0, 1000000)
        t.integers(9, 1, 100000)
    elif pid == 3563:
        n = t.integer(3, 3000)
        edges(t, n, n, connected=True)
    elif pid == 3488:
        t.integers(3, 1, 2000)
    elif pid == 3318:
        n, m = t.integer(1, 50), t.integer(1, 50)
        board = [t.word('#.', m, m) for _ in range(n)]
        filled = {(i, j) for i in range(n) for j in range(m) if board[i][j] == '#'}
        require(bool(filled), 'empty figure')
        start = next(iter(filled))
        seen, queue = {start}, deque([start])
        while queue:
            i, j = queue.popleft()
            for point in [(i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)]:
                if point in filled and point not in seen:
                    seen.add(point)
                    queue.append(point)
        require(seen == filled, 'figure is disconnected')
    elif pid in (3225, 3491, 3649, 3447):
        lo, hi = {3225: (2, 200000), 3491: (2, 200), 3649: (1, 100000), 3447: (1, 50000)}[pid]
        n = t.integer(lo, hi)
        if pid == 3447:
            t.integer(1, 500)
        edges(t, n, n - 1, (1, 1000000000) if pid == 3649 else None, connected=True, tree=True)
    elif pid == 3183:
        n = t.integer(3, 100000)
        t.integer(0, 100000)
        t.integer(1, n)
    elif pid == 3124:
        n, m = t.integer(1, 100000), t.integer(1, 100000)
        t.integers(n, 1, 100000)
        # The statement forbids self-loops, but gives no ban on parallel edges.
        edges(t, n, m, simple=False)
    elif pid == 3003:
        t.integers(t.integer(2, 200000) - 1, 1, 1000000000)
    elif pid == 632:
        n, m = t.integer(1, 2500), t.integer(1, 6200)
        s, target = t.integer(1, n), t.integer(1, n)
        dsu = edges(t, n, m, (1, 1000000000), simple=False, distinct_ends=False)
        require(dsu.find(s) == dsu.find(target), 'destination is unreachable')
    elif pid == 3514:
        n = t.integer(2, 100000)
        m = t.integer(n - 1, min(100000, n * (n - 1) // 2))
        t.integer(1, n)
        edges(t, n, m, (1, 1000), connected=True)
        t.integer(0, 1000000000)
    elif pid == 3140:
        x0, y0, x1, y1 = t.integers(4, 1, 1000000000)
        require((x0, y0) != (x1, y1), 'identical start and destination')
        n = t.integer(1, 100000)
        length, start, target = 0, False, False
        for _ in range(n):
            r, a, b = t.integers(3, 1, 1000000000)
            require(a <= b, 'reversed allowed segment')
            length += b - a + 1
            start |= r == x0 and a <= y0 <= b
            target |= r == x1 and a <= y1 <= b
        require(length <= 100000, 'total segment length exceeds 100000')
        require(start and target, 'start or destination is not allowed')
    elif pid == 2861:
        n, m = t.integer(1, 100), t.integer(1, 100)
        for _ in range(n):
            require(t.word() in ('ATK', 'DEF'), 'unknown card position')
            t.integer(0, 8000)
        t.integers(m, 0, 8000)
    elif pid == 2674:
        n, m = t.integer(1, 1000), t.integer(1, 1000)
        for _ in range(n):
            t.word('DIMA', m, m)
    elif pid == 631:
        require(len(t.tokens) % 2 == 0 and t.tokens, 'regex/string pairs are incomplete')
        while t.pos < len(t.tokens):
            regex_grammar(t.word(LOWER + '()|*+', 1, 100))
            t.word(LOWER, 1, 100)
    elif pid == 3639:
        n = t.integer(1, 100000)
        for i in range(n):
            t.integer(1, 100000)
            t.integer(0, i)
    elif pid == 3418:
        n = t.integer(1, 18)
        a = []
        for _ in range(n * n):
            raw = t.word()
            require(re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)', raw), 'invalid decimal probability')
            require('.' not in raw or len(raw.split('.')[1]) <= 6, 'more than six decimal places')
            value = Decimal(raw)
            require(0 <= value <= 1, 'probability outside [0,1]')
            a.append(value)
        require(all(a[i * n + i] == 0 for i in range(n)), 'nonzero diagonal probability')
        require(all(a[i * n + j] + a[j * n + i] == 1 for i in range(n) for j in range(i)), 'asymmetric complementary probabilities')
    elif pid in (3208, 688):
        for _ in range(2):
            t.word(LOWER, 1, 200000 if pid == 3208 else 2000)
    elif pid == 3638:
        n, m = t.integer(1, 40), t.integer(1, 40)
        require(n * m <= 40, 'board has more than forty cells')
    elif pid == 3633:
        for _ in range(3):
            t.word(LOWER, 1, 2000)
    elif pid == 3542:
        t.word(LOWER + UPPER, 1, 200000)
    elif pid == 3351:
        n = t.integer(1, 100000)
        t.integer(1, n)
        t.integers(n, -1000000000, 1000000000)
        t.integer(0, n)
    elif pid == 3336:
        n, m = t.integer(2, 100000), t.integer(0, 200000)
        k = t.integer(1, n)
        volunteers = set(t.integers(k, 1, n))
        require(len(volunteers) == k, 'duplicate volunteer position')
        edges(t, n, m)
        s, target = t.integer(1, n), t.integer(1, n)
        require(s != target and s in volunteers, 'invalid start/target/volunteer')
    elif pid == 3658:
        t.integer(1, 1000)
        m = t.integer(1, 10)
        t.integers(2 + 4 * m, 1, 100)
    elif pid == 3558:
        t.word('TF', 1, 100)
        t.integer(1, 50)
    elif pid == 3543:
        s = t.word(LOWER + UPPER, 1, 500)
        t.integer(1, len(s))
    elif pid == 3501:
        t.integers(2, 0, 1000)
    elif pid == 3496:
        balanced(t.word('()', 2, 700))
    elif pid == 3490:
        t.integer(3, 20)
        t.integer(1, 10)
    elif pid == 3464:
        n = t.integer(0, 4000)
        t.integer(0, n)
        last = 0
        for _ in range(n):
            start = t.integer(1, 86400)
            require(start > last, 'call start times are not strictly increasing')
            last = start
            t.integer(1, 86400)
    elif pid == 3430:
        n = t.integer(1, 200)
        t.integers(2, 0, 200)
        t.integers(n, 0, 100)
        require(all(a == -1 or 1 <= a <= 200 for a in t.integers(n)), 'invalid prize or bag capacity')
    elif pid == 798:
        t.integer(1, 100000)
    elif pid == 3575:
        t.integers(3, 1, 1000)
    elif pid == 3511:
        n = t.integer(1, 100000)
        t.integer(1, n)
        t.integers(n, 1, 1000000000)
    elif pid == 3472:
        for _ in range(t.integer(1, 10000)):
            t.word(LOWER, 1, 100)
    elif pid == 3329:
        n = t.integer(1, 5000)
        sold = set()
        for _ in range(n):
            action = t.word()
            require(action in ('win', 'sell'), 'unknown Bob action')
            x = t.integer(0, 2000)
            if action == 'sell':
                require(x not in sold, 'duplicate sell exponent')
                sold.add(x)
    elif pid == 3285:
        t.integers(t.integer(2, 100000) - 1, 1, 1000000000)
    elif pid == 3622:
        n, m = t.integer(1, 100000), t.integer(2, 100000000)
        for _ in range(n):
            t.integers(2, 1, m)
            t.integer(0, 100000000)
    elif pid == 3621:
        t.integers(2, 0, 1000000000)
        t.integer(1, 10000000)
    elif pid == 3597:
        t.integers(2, 1, 1000000000)
    elif pid == 3583:
        t1, t2, x1, x2, t0 = t.integers(5, 1, 1000000)
        require(t1 <= t0 <= t2, 'invalid water temperature order')
    elif pid == 3554:
        t.integer(1, 1000000)
    elif pid == 3551:
        t.word('01?', 2, 100000)
    elif pid == 3458:
        for _ in range(t.integer(1, 10000)):
            n, m = t.integer(2, 1000000000), t.integer(2, 1000000000)
            x1, y1, x2, y2 = t.integer(1, n), t.integer(1, m), t.integer(1, n), t.integer(1, m)
            require((x1, y1) != (x2, y2), 'identical laser endpoints')
    elif pid == 646:
        t.integers(t.integer(1, 100), 1, 1000000000000000000)
    elif pid == 827:
        t.integer(2, 100000000000)
    elif pid == 753:
        n = t.integer(1, 10000)
        t.integer(2, 21)
        t.integers(2 * n, 0, 2000)
    elif pid == 696:
        t.integer(1, 1000000000)
        t.integer(2, 2 ** 30 - 1)
        k = t.integer(1, 50)
        t.integer(0, k - 1)
    elif pid == 776:
        n = t.integer(1, 30000000000)
        m = t.integer(2, 12)
        require(n > m, 'n must exceed modulus')
    elif pid == 3616:
        n = t.integer(2, 10000)
        t.integer(2, n)
        t.word(DIGITS, n, n)
    elif pid == 645:
        t.integers(2, 1, 68721573904)
    elif pid == 805:
        for _ in range(2 * t.integer(1, 50)):
            t.word(LOWER, 1, 50)
    elif pid == 681:
        b, d, n = t.integer(1, 1000000000), t.integer(1, 1000000000000000000), t.integer(0, 1000000000000000000)
        require(b * b <= d < (b + 1) ** 2 <= 1000000000000000000, 'invalid quadratic bounds')
        require(b % 2 == 1 and d % 4 == 1, 'invalid b/d congruences')
    elif pid == 3576:
        t.word(LOWER, 1, 100000)
        t.integer(1, 100000)
    elif pid == 3495:
        t.word(UPPER, 2, 100000)
        m = t.integer(1, 100)
        require(len(set(t.word(UPPER, 1, 1000) for _ in range(m))) == m, 'duplicate pretty words')
    elif pid == 3366:
        n = t.integer(1, 2000)
        t.integer(1, n)
        for _ in range(n):
            t.word(LOWER, 1, 500)
    elif pid == 3294:
        n = t.integer(1, 100000)
        require(max(Counter(t.integers(n, 0, 1000000000)).values()) <= 10, 'a value occurs more than ten times')
    elif pid == 642:
        t.integers(4, 1, 1000000)
        for _ in range(2):
            l, r = t.integers(2, 1, 1000000000000000000)
            require(l <= r, 'reversed random-sequence interval')
    elif pid == 3637:
        t.integers(2, 1, 1000)
        t.integer(1, 1000000)
    elif pid == 3632:
        l, r = t.integers(2, 1, 300000000)
        require(l <= r, 'reversed prime interval')
    elif pid == 3627:
        n, m = t.integer(1, 500000), t.integer(1, 500000)
        require(n * m <= 500000, 'pipe grid too large')
        for _ in range(n):
            t.word('.1234', m, m)
    elif pid == 3609:
        n = t.integer(1, 19)
        m = t.integer(0, n * (n - 1) // 2)
        edges(t, n, m)
    elif pid == 3600:
        s = t.word(DIGITS, 2, 200000)
        require(len(s) % 2 == 0, 'ticket must have an even digit count')
    elif pid == 3590:
        n, m = t.integer(1, 100), t.integer(1, 100)
        k = t.integer(1, 1000000000000000000)
        length = n + m - 1
        require(length % 2 == 0, 'monotone path length is odd')
        half = length // 2
        require(k <= math.comb(length, half) // (half + 1), 'k exceeds the Catalan count')
        require(len(set(t.integers(n * m, 1, n * m))) == n * m, 'priority grid is not a permutation')
    elif pid == 3553:
        n, s = t.integers(2, 1, 200000)
        require(sum(t.integers(n, 0, s)) == s, 'card counts do not sum to s')
    elif pid == 3533:
        t.integers(t.integer(1, 5000), -1000000000, 1000000000)
    elif pid == 3523:
        n, length = t.integer(0, 100000), t.integer(1, 1000000000)
        for _ in range(n):
            x = t.integer(0, length)
            d, time, p = t.integers(3, 1, 1000000000)
            require(x + d <= length, 'ramp landing lies past the destination')
    else:
        raise InvalidInput('no implemented local validator')
    t.end()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--from-order', type=int, default=1)
    parser.add_argument('--to-order', type=int, default=108)
    args = parser.parse_args()
    inventory = json.loads(gzip.decompress((args.root / 'inventory.json.gz').read_bytes()))
    results = []
    for row in sorted(inventory['problems'], key=lambda r: r['order']):
        if not args.from_order <= row['order'] <= args.to_order:
            continue
        result = dict(order=row['order'], pid=row['docId'], type=row['parsedConfig']['type'], files=[], issues=[])
        for f in row['fileAudit']:
            if f['kind'] != 'testdata' or not f['name'].endswith('.in'):
                continue
            data = (args.root / 'data' / str(row['docId']) / 'testdata' / f['name']).read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            issue = None
            try:
                require(digest == f['sha256'] and len(data) == f['size'], 'snapshot hash/size mismatch')
                validate(row['docId'], data)
            except (InvalidInput, InvalidOperation, RecursionError) as error:
                issue = str(error)
                result['issues'].append(dict(name=f['name'], issue=issue))
            result['files'].append(dict(name=f['name'], sha256=digest, bytes=len(data), passed=issue is None))
        result['status'] = 'remote-inputs-unavailable' if result['type'] == 'remote_judge' else ('failed' if result['issues'] else 'passed')
        results.append(result)
        print('XCPC_INPUT_VALIDATION', result['order'], result['pid'], result['status'], 'files', len(result['files']),
              json.dumps(result['issues'], ensure_ascii=False), flush=True)
    report = dict(inventorySha256=hashlib.sha256((args.root / 'inventory.json.gz').read_bytes()).hexdigest(),
                  validatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), problems=results)
    name = 'input-validation.json' if (args.from_order, args.to_order) == (1, 108) else f'input-validation-{args.from_order}-{args.to_order}.json'
    (args.root / name).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('XCPC_INPUT_VALIDATION_COMPLETE', len(results), 'files', sum(len(r['files']) for r in results),
          'issueFiles', sum(len(r['issues']) for r in results), flush=True)
    return int(any(r['issues'] for r in results))


if __name__ == '__main__':
    raise SystemExit(main())
