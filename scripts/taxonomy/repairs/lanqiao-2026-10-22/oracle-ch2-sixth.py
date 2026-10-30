"""Independent answers and input checks for training orders 50–57."""
from functools import lru_cache
from heapq import heapify, heapreplace
from itertools import permutations
from math import comb, isqrt
from bisect import bisect_left
import re


def one_integer(text):
    values = list(map(int,text.split()))
    assert len(values) == 1
    return values[0]


def perfect(text):
    number = one_integer(text)
    assert -(1<<31) <= number < (1<<31)
    if number <= 1:
        return 'no'
    # Derive the divisor sum from prime factorization, independently of C++ pairs.
    remaining, total, prime = number, 1, 2
    while prime*prime <= remaining:
        power, term = 1,1
        while remaining % prime == 0:
            remaining //= prime
            power *= prime
            term += power
        total *= term
        prime += 1
    if remaining > 1:
        total *= remaining+1
    return 'yes' if total-number == number else 'no'


def lonely(text):
    bound = one_integer(text)
    assert 1 <= bound <= 10000
    result = []
    # A number can only have a generator in [number - 9*digits, number).
    for number in range(1,bound):
        low = max(1,number-9*len(str(number)))
        if not any(value+sum(map(int,str(value)))==number for value in range(low,number)):
            result.append(str(number))
    return '\n'.join(result)


def powers(text):
    number = one_integer(text)
    assert 1 <= number <= 20000
    def format_number(value):
        terms = []
        # Repeated division extracts exponents rather than C++ bit tests.
        exponent = 0
        while value:
            value,bit = divmod(value,2)
            if bit:
                terms.append('2' if exponent==1 else '2('+('0' if exponent==0 else format_number(exponent))+')')
            exponent += 1
        return '+'.join(terms[::-1])
    return format_number(number)


def evaluate_powers(text):
    position = 0
    def expression():
        nonlocal position
        if text[position] == '0':
            position += 1
            return 0
        total = 0
        while True:
            assert text[position] == '2'
            position += 1
            if position < len(text) and text[position]=='(':
                position += 1
                exponent = expression()
                assert text[position] == ')'
                position += 1
                total += 1<<exponent
            else:
                total += 2
            if position == len(text) or text[position] != '+':
                return total
            position += 1
    value = expression()
    assert position == len(text)
    return value


def shopping_input(text):
    values = list(map(int,text.split()))
    assert len(values) >= 2
    budget,count = values[:2]
    assert 1 <= budget < 30000 and 1 <= count < 25 and len(values)==2+2*count
    objects = list(zip(values[2::2],values[3::2]))
    assert all(0 <= price <= 10000 and 1 <= weight <= 5 for price,weight in objects)
    return budget,objects


def shopping(text):
    budget,objects = shopping_input(text)
    # Keep nondominated (exact spent cost, value) states; C++ uses capacity DP.
    states = {0:0}
    for price,weight in objects:
        candidates = dict(states)
        for spent,total in states.items():
            if spent+price <= budget:
                candidates[spent+price] = max(candidates.get(spent+price,-1),total+price*weight)
        best,states = -1,{}
        for spent,total in sorted(candidates.items()):
            if total > best:
                states[spent] = total
                best = total
    return str(max(states.values()))


def missiles_input(text):
    heights = list(map(int,text.split()))
    assert heights and all(1 <= h <= 30000 for h in heights)
    return heights


def missiles(text):
    heights = missiles_input(text)
    size = 30000
    def query(tree,index):
        best = 0
        while index:
            best = max(best,tree[index])
            index -= index & -index
        return best
    def update(tree,index,value):
        while index <= size:
            tree[index] = max(tree[index],value)
            index += index & -index
    down,up = [0]*(size+1),[0]*(size+1)
    longest,systems = 0,0
    for height in heights:
        reversed_height = size+1-height
        a = query(down,reversed_height)+1
        b = query(up,height-1)+1
        update(down,reversed_height,a)
        update(up,height,b)
        longest,systems = max(longest,a),max(systems,b)
    return f'{longest}\n{systems}'


def permutation_input(text):
    values = list(map(int,text.split()))
    assert len(values) >= 2
    n,k = values[:2]
    assert 1 <= n <= 10 and 1 <= k <= 500000 and len(values)==2+n*n
    table = [values[2+i*n:2+(i+1)*n] for i in range(n)]
    assert all(x in [0,1] for row in table for x in row)
    assert all(table[i][i]==0 for i in range(n))
    return n,k,table


def permutation_count(table):
    n = len(table)
    @lru_cache(None)
    def count(mask,last):
        if mask == (1<<n)-1:
            return 1
        return sum(count(mask|1<<value,value) for value in range(n) if not mask>>value&1 and (last==-1 or table[last][value]))
    return count


def permutation(text):
    n,k,table = permutation_input(text)
    count = permutation_count(table)
    assert k <= count(0,-1), 'K exceeds the number of legal permutations'
    # Binary search a lexicographic rank among every permutation, not C++ unranking.
    def before(prefix):
        result,mask,last = 0,0,-1
        for actual in prefix:
            for smaller in range(actual):
                if not mask>>smaller&1 and (last==-1 or table[last][smaller]):
                    result += count(mask|1<<smaller,smaller)
            if mask>>actual&1 or (last!=-1 and not table[last][actual]):
                return result
            mask |= 1<<actual
            last = actual
        return result
    available = list(range(n))
    prefix = []
    for _ in range(n):
        # Count how many completions lie strictly before each candidate prefix.
        value = max(v for v in available if before(prefix+[v])<k)
        prefix.append(value)
        available.remove(value)
    assert all(table[a][b] for a,b in zip(prefix,prefix[1:]))
    assert before(prefix) == k-1
    return ' '.join(map(str,prefix))


def water_input(text):
    values = list(map(int,text.split()))
    assert len(values) >= 2
    n,m = values[:2]
    assert 1 <= n <= 10000 and 1 <= m <= min(n,100) and len(values)==n+2
    amounts = values[2:]
    assert all(1 <= value <= 100 for value in amounts)
    return m,amounts


def water(text):
    m,amounts = water_input(text)
    finish = amounts[:m]
    heapify(finish)
    for amount in amounts[m:]:
        heapreplace(finish,finish[0]+amount)
    return str(max(finish))


def swing(text):
    bound = one_integer(text)
    assert 1 <= bound <= 20
    # Count the two alternating extreme-removal sequences for each selected set.
    return str(sum(2*comb(bound,length) for length in range(2,bound+1)))


def solve(pid,text):
    return {4268:perfect,4269:lonely,4270:powers,4271:shopping,4272:missiles,
            4273:permutation,4274:water,4275:swing}[pid](text)
