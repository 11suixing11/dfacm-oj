"""Independent answers and input checks for training orders 74–81."""


def one_integer(text):
    values = list(map(int, text.split()))
    assert len(values) == 1
    return values[0]


def longest(text):
    tokens = text.split()
    assert len(tokens) == 5
    assert all(token.isalpha() and token.islower() and len(token) <= 100 for token in tokens)
    best = max(len(token) for token in tokens)
    return next(token for token in tokens if len(token) == best)


def trees(text):
    values = list(map(int, text.split()))
    length, count = values[0], values[1]
    assert 1 <= length <= 10000 and 1 <= count <= 100 and len(values) == 2 + 2 * count
    removed = set()
    for index in range(count):
        start, end = values[2 + 2 * index], values[3 + 2 * index]
        assert start != end and 0 <= min(start, end) and max(start, end) <= length
        removed.update(range(min(start, end), max(start, end) + 1))
    return str(length + 1 - len(removed))


def matchplan_days(total):
    days = [[] for _ in range(total - 1)]

    def build(size, base):
        if size == 1:
            return
        half = size // 2
        build(half, base)
        build(half, base + half)
        for rotation in range(half):
            for index in range(half):
                days[half - 1 + rotation].append((base + index, base + half + (index ^ rotation)))

    build(total, 0)
    return days


def matchplan(text):
    n = one_integer(text)
    assert 1 <= n <= 6
    days = matchplan_days(1 << n)
    lines = []
    for number, matches in enumerate(days, 1):
        line = f'<{number}>'
        for first, second in matches:
            line += f'{first + 1}-{second + 1} '
        lines.append(line)
    return '\n'.join(lines)


def compare(text):
    first, second = text.split()
    assert len(first) <= 100 and len(second) <= 100
    assert not (first != second and (first.startswith(second) or second.startswith(first))), 'proper prefix excluded'
    for left, right in zip(first, second):
        if left != right:
            return str(ord(left) - ord(right))
    assert first == second, 'one string is a proper prefix of the other'
    return '0'


def narcissus(text):
    number = one_integer(text)
    if not 100 <= number <= 999:
        return 'NO'
    digits = [int(character) for character in str(number)]
    return 'YES' if sum(value ** 3 for value in digits) == number else 'NO'


def preorder(text):
    inorder, postorder = text.split()
    assert len(inorder) == len(postorder) <= 8
    assert inorder.isupper() and postorder.isupper()
    assert len(set(inorder)) == len(inorder) and sorted(inorder) == sorted(postorder)

    def walk(in_left, in_right, post_left, post_right):
        if in_left > in_right:
            return ''
        root = postorder[post_right]
        middle = inorder.index(root, in_left)
        span = middle - in_left
        return (root + walk(in_left, middle - 1, post_left, post_left + span - 1)
                + walk(middle + 1, in_right, post_left + span, post_right - 1))

    return walk(0, len(inorder) - 1, 0, len(postorder) - 1)


def forty(text):
    assert not text.strip(), 'this problem has no input'
    values = []
    for number in range(1000, 10000):
        if sum(int(character) for character in str(number)) == 10:
            values.append(str(number))
    return '\n'.join(values)


def apples(text):
    values = list(map(int, text.split()))
    n, m = values
    assert len(values) == 2 and 0 < m < n < 9
    answer = n ** (n + 1) - (n - 1) * m
    remaining = answer
    for _ in range(n):
        assert (remaining - m) % n == 0
        remaining = (n - 1) * (remaining - m) // n
    assert remaining % n == m, 'final division must leave exactly m apples'
    return str(answer)


def solve(pid, text):
    return {4292: longest, 4293: trees, 4294: matchplan, 4295: compare,
            4296: narcissus, 4297: preorder, 4298: forty, 4299: apples}[pid](text)
