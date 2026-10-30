"""Independent answers and input checks for training orders 82–89."""
from functools import lru_cache


def queens_king(text):
    values = list(map(int, text.split()))
    assert len(values) == 3
    n, x, y = values
    assert 1 <= n <= 12 and 1 <= x <= n and 1 <= y <= n
    king_row, king_column = x - 1, y - 1
    columns, rising, falling = set(), set(), set()

    def search(row):
        if row == n:
            return 1
        total = 0
        for column in range(n):
            if column in columns or row + column in rising or row - column in falling:
                continue
            if abs(row - king_row) <= 1 and abs(column - king_column) <= 1:
                continue
            columns.add(column)
            rising.add(row + column)
            falling.add(row - column)
            total += search(row + 1)
            columns.remove(column)
            rising.remove(row + column)
            falling.remove(row - column)
        return total

    return str(search(0))


def tiling(text):
    values = list(map(int, text.split()))
    assert len(values) == 1
    n = values[0]
    assert 1 <= n <= 10

    def enumerate_ways(length):
        if length == 0:
            return 1
        total = enumerate_ways(length - 1)
        if length >= 2:
            total += enumerate_ways(length - 2)
        return total

    return str(enumerate_ways(n))


def matrix_sum(text):
    values = list(map(int, text.split()))
    n, m = values[0], values[1]
    assert 1 <= n <= 100 and 1 <= m <= 100 and len(values) == 2 + 2 * n * m
    body = values[2:]
    lines = []
    for row in range(n):
        pieces = []
        for column in range(m):
            first = body[row * m + column]
            second = body[n * m + row * m + column]
            assert abs(first) <= 1000 and abs(second) <= 1000
            pieces.append(str(first + second))
        lines.append(' '.join(pieces))
    return '\n'.join(lines)


def vowel(text):
    tokens = text.split()
    assert len(tokens) == 1
    word = tokens[0]
    assert word.isalpha() and word.islower()
    for index, character in enumerate(word, 1):
        if character in 'aeiou':
            return str(index)
    return '0'


def josephus(text):
    values = list(map(int, text.split()))
    assert len(values) == 1
    n = values[0]
    assert 1 < n < 10000
    circle = list(range(1, n + 1))
    position = 0
    while len(circle) > 1:
        position = (position + 2) % len(circle)
        circle.pop(position)
        if position == len(circle):
            position = 0
    return str(circle[0])


def simple_addition(text):
    values = list(map(int, text.split()))
    assert len(values) == 1
    n = values[0]
    assert 1 <= n <= 9999
    total = 0
    for i in range(n):
        digits = [ord(c) - 48 for c in str(i).rjust(5, '0')]
        following = [ord(c) - 48 for c in str(i + 1).rjust(5, '0')]
        third = [ord(c) - 48 for c in str(i + 2).rjust(5, '0')]
        if all(a + b + c <= 9 for a, b, c in zip(digits, following, third)):
            total += 1
    return str(total)


def souvenir(text):
    values = list(map(int, text.split()))
    w, n = values[0], values[1]
    assert len(values) == 2 + n and 80 <= w <= 200 and 1 <= n <= 30000
    prices = values[2:]
    assert all(5 <= price <= w for price in prices)
    prices.sort()
    light, heavy = 0, len(prices) - 1
    groups = 0
    while light <= heavy:
        if prices[light] + prices[heavy] <= w:
            light += 1
        heavy -= 1
        groups += 1
    return str(groups)


def word_count(text):
    lines = [line for line in text.split('\n') if line.strip() != '']
    p, k = map(int, lines[0].split())
    assert 1 <= k <= 40 and k <= p * 20
    letters = ''.join(lines[1:1 + p])
    assert len(letters) == p * 20 and letters.isalpha() and letters.islower()
    size = int(lines[1 + p])
    assert 1 <= size <= 6
    words = lines[2 + p:2 + p + size]
    assert len(words) == size
    total = len(letters)
    # cnt[l][r] = words whose start position lies in [l, r) with a full match inside.
    cnt = [[0] * (total + 1) for _ in range(total + 1)]
    for length in range(1, total + 1):
        for l in range(total - length + 1):
            r = l + length
            gained = 0
            for word in words:
                if letters.startswith(word, l) and l + len(word) <= r:
                    gained = 1
                    break
            cnt[l][r] = cnt[l + 1][r] + gained if l + 1 <= total else gained
    negative = -10 ** 9
    table = [[negative] * (total + 1) for _ in range(k + 1)]
    table[0][0] = 0
    for parts in range(1, k + 1):
        for end in range(1, total + 1):
            for cut in range(parts - 1, end):
                if table[parts - 1][cut] > negative:
                    table[parts][end] = max(table[parts][end], table[parts - 1][cut] + cnt[cut][end])
    assert table[k][total] > negative, 'each part needs at least one letter'
    return str(table[k][total])


def solve(pid, text):
    return {4300: queens_king, 4301: tiling, 4303: matrix_sum, 4304: vowel,
            4305: josephus, 4306: simple_addition, 4307: souvenir, 4308: word_count}[pid](text)
