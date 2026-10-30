"""Independent answers and input checks for training orders 66–73."""
from fractions import Fraction
from math import gcd


def slope(text):
    values = list(map(int, text.split()))
    assert len(values) == 4
    x1, y1, x2, y2 = values
    if x1 == x2:
        return 'INF'
    rise, run = y2 - y1, x2 - x1
    assert rise % run == 0, 'slope is not an integer'
    return str(rise // run)


def dance(text):
    tokens = text.split()
    n = int(tokens[0])
    assert 2 <= n <= 1000
    index = 1
    by_name, by_number = {}, {}
    for _ in range(n):
        name, number, sex = tokens[index], tokens[index + 1], tokens[index + 2]
        index += 3
        assert sex in ('F', 'M') and name.isalpha() and number.isdigit()
        assert name not in by_name and number not in by_number
        by_name[name] = sex
        by_number[number] = sex
    m = int(tokens[index])
    index += 1
    assert 1 <= m <= 1000 and len(tokens) == index + 2 * m
    answers = []
    for _ in range(m):
        left, right = tokens[index], tokens[index + 1]
        index += 2
        first = by_name[left] if left in by_name else by_number[left]
        second = by_name[right] if right in by_name else by_number[right]
        answers.append('Y' if first != second else 'N')
    return '\n'.join(answers)


def grid_pick(text):
    values = list(map(int, text.split()))
    n = values[0]
    assert 1 <= n <= 10
    grid = [[0] * (n + 1) for _ in range(n + 1)]
    index = 1
    while not (values[index] == 0 and values[index + 1] == 0 and values[index + 2] == 0):
        x, y, value = values[index], values[index + 1], values[index + 2]
        index += 3
        assert 1 <= x <= n and 1 <= y <= n and value >= 0
        grid[x][y] = value
    assert index + 3 == len(values), 'input must end with a single 0 0 0 line'
    # dp[(i, j)]: both walkers stand on the same anti-diagonal, in rows i and j;
    # shared cells are added once. Anti-diagonal step has row + col = step.
    table = {(1, 1): grid[1][1]}
    for step in range(3, 2 * n + 1):
        following = {}
        low, high = max(1, step - n), min(n, step - 1)
        prev_low, prev_high = max(1, (step - 1) - n), min(n, step - 2)
        for i in range(low, high + 1):
            for j in range(low, high + 1):
                best = None
                for pi, pj in ((i - 1, j - 1), (i - 1, j), (i, j - 1), (i, j)):
                    if not prev_low <= pi <= prev_high or not prev_low <= pj <= prev_high:
                        continue
                    if (pi, pj) in table and (best is None or table[(pi, pj)] > best):
                        best = table[(pi, pj)]
                if best is None:
                    continue
                gain = grid[i][step - i]
                if (i, step - i) != (j, step - j):
                    gain += grid[j][step - j]
                value = best + gain
                if value > following.get((i, j), -1):
                    following[(i, j)] = value
        table = following
    return str(table[(n, n)])


def travel_cost(text):
    """Exact minimum cost as a Fraction, or None when unreachable."""
    tokens = text.split()
    distance, capacity, efficiency, start_price = (Fraction(tokens[i]) for i in range(4))
    count = int(tokens[4])
    stations = [(Fraction(0), start_price)]
    index = 5
    for _ in range(count):
        stations.append((Fraction(tokens[index]), Fraction(tokens[index + 1])))
        index += 2
    assert len(tokens) == index
    stations.sort()
    reach = capacity * efficiency
    # Every kilometre must be drivable on fuel bought at the cheapest station
    # within one tank range behind it; the integral of those prices is exact.
    points = {Fraction(0), distance}
    for position, _ in stations:
        if 0 < position < distance:
            points.add(position)
        if 0 < position + reach < distance:
            points.add(position + reach)
    ordered = sorted(points)
    total = Fraction(0)
    for left, right in zip(ordered, ordered[1:]):
        middle = (left + right) / 2
        if left == right or middle <= 0 or middle >= distance:
            continue
        cheapest = None
        for position, price in stations:
            if position <= middle <= position + reach:
                if cheapest is None or price < cheapest:
                    cheapest = price
        if cheapest is None:
            return None
        total += (right - left) / efficiency * cheapest
    return total


def travel(text):
    total = travel_cost(text)
    if total is None:
        return 'No Solution'
    cents = (total * 100 + Fraction(1, 2)).__floor__()
    return f'{cents // 100}.{cents % 100:02d}'


def randoms(text):
    values = list(map(int, text.split()))
    n, numbers = values[0], values[1:]
    assert 1 <= n <= 100 and len(numbers) == n
    assert all(1 <= value <= 1000 for value in numbers)
    unique = sorted(set(numbers))
    return f"{len(unique)}\n{' '.join(map(str, unique))}"


def next_permutation(values):
    i = len(values) - 2
    while i >= 0 and values[i] >= values[i + 1]:
        i -= 1
    if i < 0:
        return None
    j = len(values) - 1
    while values[j] <= values[i]:
        j -= 1
    values[i], values[j] = values[j], values[i]
    values[i + 1:] = reversed(values[i + 1:])
    return values


def mars(text):
    values = list(map(int, text.split()))
    n, m, fingers = values[0], values[1], values[2:]
    assert 1 <= n <= 10000 and 1 <= m <= 100
    assert sorted(fingers) == list(range(1, n + 1))
    fingers = list(fingers)
    for _ in range(m):
        fingers = next_permutation(fingers)
        assert fingers is not None, 'result exceeds the representable range'
    return ' '.join(map(str, fingers))


def crush(text):
    values = list(map(int, text.split()))
    rows, cols = values[0], values[1]
    grid = values[2:]
    assert rows >= 1 and cols >= 1 and rows <= 200 and cols <= 200 and len(grid) == rows * cols
    assert all(cell in (0, 1) for cell in grid)
    best = 0
    for color in (0, 1):
        table = [[0] * cols for _ in range(rows)]
        for i in range(rows):
            for j in range(cols):
                if grid[i * cols + j] == color:
                    if i == 0 or j == 0:
                        table[i][j] = 1
                    else:
                        table[i][j] = min(table[i - 1][j], table[i][j - 1], table[i - 1][j - 1]) + 1
                    best = max(best, table[i][j] * table[i][j])
    return str(best)


def volume(text):
    values = list(map(int, text.split()))
    n, items = values[0], values[1:]
    assert 1 <= n <= 10 and len(items) == n
    assert all(1 <= value <= 500 for value in items)
    if 1 in items:
        return '0'
    common = items[0]
    for value in items[1:]:
        common = gcd(common, value)
    if common > 1:
        return '0'
    bound = 500 * 500 + 1
    reachable = bytearray(bound + 1)
    reachable[0] = 1
    for value in items:
        for x in range(value, bound + 1):
            if reachable[x - value]:
                reachable[x] = 1
    # With every volume <= 500, a run of 500 reachable values closes the tail.
    assert all(reachable[bound - 499:bound + 1]), 'answer may exceed the search bound'
    answer = 0
    for x in range(bound, 0, -1):
        if not reachable[x]:
            answer = x
            break
    return str(answer)


def solve(pid, text):
    return {4284: slope, 4285: dance, 4286: grid_pick, 4287: travel,
            4288: randoms, 4289: mars, 4290: crush, 4291: volume}[pid](text)
