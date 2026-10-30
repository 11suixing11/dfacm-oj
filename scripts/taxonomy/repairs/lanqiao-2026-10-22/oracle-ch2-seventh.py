"""Independent answers and input checks for training orders 58–65."""
from itertools import combinations
from math import isqrt


def one_integer(text):
    values = list(map(int, text.split()))
    assert len(values) == 1
    return values[0]


def separate(text):
    number = one_integer(text)
    assert 1 <= number <= 1000
    digits = []
    remaining = number
    # Repeated division collects digits without touching strings.
    while remaining:
        remaining, digit = divmod(remaining, 10)
        digits.append(str(digit))
    assert int(''.join(reversed(digits))) == number
    return ' '.join(reversed(digits))


def sequence_terms(k, count):
    # Build the sequence straight from the definition: all sums of distinct
    # powers of k, ordered. The first 2^m - 1 terms are exactly the subset
    # sums of the first m powers (each sum of the first m powers is < k^m).
    powers = [k ** exponent for exponent in range(64)]
    needed = 1
    while 2 ** needed - 1 < count:
        needed += 1
    terms = {0}
    for exponent in range(needed):
        terms |= {value + powers[exponent] for value in terms}
    terms.discard(0)
    ordered = sorted(terms)
    assert len(ordered) >= count
    return ordered


def sequence(text):
    values = list(map(int, text.split()))
    assert len(values) == 2
    k, n = values
    assert 3 <= k <= 15 and 10 <= n <= 1000
    answer = str(sequence_terms(k, n)[n - 1])
    # The statement guarantees every judge result stays within 2.1*10^9.
    assert int(answer) <= 2100000000, 'result exceeds the documented 2.1*10^9 bound'
    return answer


def pairs(text):
    number = one_integer(text)
    assert 1 <= number <= 100000
    lines = []
    # Trial division on every candidate keeps this independent of the
    # sqrt-pair collection used by the reference program.
    for divisor in range(1, number + 1):
        if number % divisor == 0:
            lines.append(f'{divisor} * {number // divisor} = {number}')
    return '\n'.join(lines)


def divisor_count(number):
    total, divisor = 1, 2
    while divisor * divisor <= number:
        power = 0
        while number % divisor == 0:
            number //= divisor
            power += 1
        total *= power + 1
        divisor += 1
    if number > 1:
        total *= 2
    return total


def partition_input(text):
    values = list(map(int, text.split()))
    assert len(values) == 2
    n, k = values
    assert 7 <= n <= 200 and 2 <= k <= 6
    return n, k


def partitions_exact(n, k):
    # f(i, j) = partitions of i into exactly j parts.
    table = [[0] * (k + 1) for _ in range(n + 1)]
    table[0][0] = 1
    for i in range(1, n + 1):
        for j in range(1, min(i, k) + 1):
            table[i][j] = table[i - 1][j - 1] + (table[i - j][j] if i >= j else 0)
    return table[n][k]


def partitions_at_most(m, j):
    # Independent identity: partitions of m into at most j parts.
    table = [[0] * (j + 1) for _ in range(m + 1)]
    for limit in range(j + 1):
        table[0][limit] = 1
    for value in range(1, m + 1):
        for limit in range(1, j + 1):
            table[value][limit] = table[value][limit - 1]
            if value >= limit:
                table[value][limit] += table[value - limit][limit]
    return table[m][j]


def partitions(text):
    n, k = partition_input(text)
    return str(partitions_exact(n, k))


def statistics(text):
    values = list(map(int, text.split()))
    n = values[0]
    assert 1 <= n <= 1000 and len(values) == n + 1
    numbers = values[1:]
    assert all(1 <= x <= 1000000 for x in numbers)
    counts = {}
    for value in numbers:
        counts[value] = counts.get(value, 0) + 1
    assert sum(counts.values()) == n
    return '\n'.join(f'{value} {counts[value]}' for value in sorted(counts))


def array_transform(text):
    values = list(map(int, text.split()))
    count, b = values[:2]
    assert 1 <= count <= 100 and 1 <= b <= 100 and len(values) == 2 + count
    numbers = values[2:]
    kept = sorted(value for value in numbers if value % b != 0)
    tokens = []
    for value in kept:
        if 65 <= value <= 90:
            tokens.append(chr(value))
        else:
            tokens.append(str(value))
    return ' '.join(tokens)


def average(text):
    values = list(map(int, text.split()))
    n = values[0]
    assert n >= 1 and len(values) == n + 1
    total = sum(values[1:])
    # Integer part of the mean, truncated toward zero like C++ division.
    quotient = total // n if total >= 0 else -((-total) // n)
    return str(quotient)


def divisible(text):
    values = list(map(int, text.split()))
    assert len(values) == 3
    lo, hi, factor = values
    assert 1 <= lo <= hi and factor >= 1
    # Step over multiples of factor instead of testing every integer.
    first = ((lo + factor - 1) // factor) * factor
    multiples = []
    while first <= hi:
        multiples.append(str(first))
        first += factor
    return ' '.join(multiples)


def solve(pid, text):
    return {4276: separate, 4277: sequence, 4278: pairs, 4279: partitions,
            4280: statistics, 4281: array_transform, 4282: average,
            4283: divisible}[pid](text)
