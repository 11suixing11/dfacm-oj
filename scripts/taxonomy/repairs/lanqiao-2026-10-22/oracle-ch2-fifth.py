"""Independent input validators and answers for training orders 42–49."""
from collections import Counter, defaultdict
import re

LONG_MIN, LONG_MAX = -(1 << 31), (1 << 31) - 1
INT64_MAX = (1 << 63) - 1


def reverse_number(text):
    tokens = text.split()
    assert len(tokens) == 2 and all(re.fullmatch(r'[0-9]+', s) for s in tokens)
    values = list(map(int, tokens))
    reversed_values = [int(str(value)[::-1]) for value in values]
    total = sum(reversed_values)
    answer = int(str(total)[::-1])
    assert all(0 <= value <= INT64_MAX for value in values + reversed_values + [total, answer])
    return str(answer)


def subset_input(text, allow_debug=False):
    values = list(map(int, text.split()))
    assert values
    n = values[0]
    assert 1 <= n <= 22 and len(values) == n + 2 + bool(allow_debug and len(values) == n+3)
    numbers, target = values[1:n+1], values[n+1]
    assert LONG_MIN <= target <= LONG_MAX
    assert sum(x for x in numbers if x < 0) >= LONG_MIN
    assert sum(x for x in numbers if x > 0) <= LONG_MAX
    return numbers, target


def mask_sums(numbers):
    sums = [0] * (1 << len(numbers))
    for mask in range(1, len(sums)):
        bit = mask & -mask
        sums[mask] = sums[mask ^ bit] + numbers[bit.bit_length()-1]
    return sums


def subset_masks(text):
    numbers, target = subset_input(text)
    split = len(numbers) // 2
    left = defaultdict(list)
    for mask, total in enumerate(mask_sums(numbers[:split])):
        left[total].append(mask)
    # Higher bits form the outer loop, so complete masks remain strictly increasing.
    for high, total in enumerate(mask_sums(numbers[split:])):
        for low in left.get(target-total, ()):
            mask = (high << split) | low
            if mask:
                yield mask


def subset_lines(text):
    numbers, _ = subset_input(text)
    count = 0
    for mask in subset_masks(text):
        yield ' '.join(str(value) for i, value in enumerate(numbers) if mask >> i & 1) + '\n'
        count += 1
    yield str(count) + '\n'


def subsets(text):
    return ''.join(subset_lines(text)).rstrip('\n')


def palindrome_input(text):
    tokens = text.split()
    assert len(tokens) == 2
    base, digits = int(tokens[0]), tokens[1]
    assert base in list(range(2, 11)) + [16]
    assert digits and digits[0] != '0' and all(c in '0123456789ABCDEF'[:base] for c in digits)
    return base, digits


def base_digits(number, base):
    alphabet = '0123456789ABCDEF'
    result = []
    while number:
        number, digit = divmod(number, base)
        result.append(alphabet[digit])
    return ''.join(reversed(result)) or '0'


def palindrome(text, max_steps=30):
    base, digits = palindrome_input(text)
    number = int(digits, base)
    for step in range(max_steps + 1):
        digits = base_digits(number, base)
        if digits == digits[::-1]:
            return f'STEP={step}'
        number += int(digits[::-1], base)
    return 'Impossible!'


def substring_input(text):
    tokens = text.split()
    assert len(tokens) == 2
    length, value = int(tokens[0]), tokens[1]
    assert 1 <= length <= len(value) <= 60 and re.fullmatch(r'[a-z]+', value)
    return length, value


def substring(text):
    length, value = substring_input(text)
    counts, first = Counter(), {}
    for start in range(len(value)):
        for stop in range(start + length, len(value) + 1):
            sub = value[start:stop]
            counts[sub] += 1
            first.setdefault(sub, start)
    return max(counts, key=lambda sub: (counts[sub], len(sub), -first[sub]))


def expansion_input(text):
    tokens = text.split()
    assert len(tokens) == 4
    p1, p2, p3 = map(int, tokens[:3])
    value = tokens[3]
    assert 1 <= p1 <= 3 and 1 <= p2 <= 8 and 1 <= p3 <= 2
    assert 1 <= len(value) <= 100 and re.fullmatch(r'[a-z0-9-]+', value)
    return p1, p2, p3, value


def expansion(text):
    p1, p2, p3, value = expansion_input(text)
    alphabets = ['0123456789', 'abcdefghijklmnopqrstuvwxyz']
    pieces = []
    for index, char in enumerate(value):
        if char != '-' or not 0 < index < len(value)-1:
            pieces.append(char)
            continue
        before, after = value[index-1:index+2:2]
        alphabet = next((a for a in alphabets if before in a and after in a), None)
        if alphabet is None or alphabet.index(before) >= alphabet.index(after):
            pieces.append('-')
            continue
        fill = alphabet[alphabet.index(before)+1:alphabet.index(after)]
        if p3 == 2:
            fill = fill[::-1]
        if p1 == 3:
            fill = '*' * len(fill)
        elif p1 == 2:
            fill = fill.upper()
        pieces.append(''.join(char*p2 for char in fill))
    return ''.join(pieces)


def edit_input(text):
    lines = text.splitlines()
    assert len(lines) >= 2
    value = lines[0]
    assert 1 <= len(value) <= 40 and value[-1] == '.' and '.' not in value[:-1]
    assert all(32 <= ord(char) <= 126 for char in value)
    command = ' '.join(lines[1:]).split()
    assert command and command[0] in ['D', 'I', 'R']
    assert len(command) == (2 if command[0] == 'D' else 3)
    assert all(len(c) == 1 and 33 <= ord(c) <= 126 for c in command[1:])
    return value, command


def edit(text):
    value, command = edit_input(text)
    op, target = command[:2]
    positions = [i for i, c in enumerate(value) if c == target]
    if not positions:
        return 'IS NOT FOUND'
    if op == 'D':
        index = positions[0]
        return value[:index] + value[index+1:]
    if op == 'I':
        index = positions[-1]
        return value[:index] + command[2] + value[index:]
    return ''.join(command[2] if c == target else c for c in value)


def delete_input(text):
    # Preserve an empty first line and reject a missing deletion character.
    lines = text.splitlines()
    assert len(lines) >= 2 and all(not line for line in lines[2:])
    value, char = lines[:2]
    assert len(value) <= 20 and all(33 <= ord(c) <= 126 for c in value)
    assert len(char) == 1 and 33 <= ord(char) <= 126
    return value, char


def delete(text):
    value, char = delete_input(text)
    return ''.join(c for c in value if c != char)


RECIPES = [(2,1,0,2), (1,1,1,1), (0,0,2,1), (0,3,0,0), (1,0,0,1)]


def cooking_input(text):
    values = list(map(int, text.split()))
    assert len(values) == 4 and all(0 <= x <= 30 for x in values)
    return values


def cooking(text):
    values = cooking_input(text)
    answers = []
    for recipe in RECIPES:
        count = min(values[i] // cost for i, cost in enumerate(recipe) if cost)
        answers.append(str(count))
        values = [value-count*cost for value, cost in zip(values, recipe)]
    return '\n'.join(answers)


SOLVERS = {4260: reverse_number, 4261: subsets, 4262: palindrome, 4263: substring,
           4264: expansion, 4265: edit, 4266: delete, 4267: cooking}


def solve(pid, text):
    return SOLVERS[pid](text)
