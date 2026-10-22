# 模板：数论基础（快速幂 / GCD / 组合数 / 素数筛）

## 适用信号
- 大数幂取模 a^b mod p（费马小定理求逆元是标配前置）；
- 组合数 C(n,m) mod p（n,m ≤ 1e6 预处理阶乘+逆元）；
- 素数判定/素数表（线性筛）。

## 复杂度
快速幂 O(log b)；组合数预处理 O(n)；欧拉筛 O(n)。

## 常见坑
1. 快速幂开头 `a %= p`（a 可能 ≥ p）；指数为 0 返回 1；
2. 费马小逆元只适用于 p 为素数且 a 不被 p 整除；p 非素数用 exgcd；
3. n ≥ p 时 C(n,m) mod p 要 Lucas 定理，阶乘预处理会错。

## 模板（快速幂 + 组合数预处理）

```cpp
#include <bits/stdc++.h>
using namespace std;

const int MOD = 1e9 + 7, N = 1000010;
long long fac[N], inv[N];

long long qpow(long long a, long long b, long long p) {
    long long r = 1;
    a %= p;
    for (; b; b >>= 1, a = a * a % p)
        if (b & 1) r = r * a % p;
    return r;
}

void init(int n) {
    fac[0] = 1;
    for (int i = 1; i <= n; i++) fac[i] = fac[i - 1] * i % MOD;
    inv[n] = qpow(fac[n], MOD - 2, MOD);
    for (int i = n; i >= 1; i--) inv[i - 1] = inv[i] * i % MOD;
}

long long C(int n, int m) {
    if (m < 0 || m > n) return 0;
    return fac[n] * inv[m] % MOD * inv[n - m] % MOD;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    init(1000000);
    int n, m;
    cin >> n >> m;
    cout << C(n, m) << "\n";
    return 0;
}
```

> GCD：`__gcd(a,b)` 或手写辗转相除。欧拉筛素数：`for i in 2..n`，未标记则为素数，用最小素因子筛合数，O(n)。
