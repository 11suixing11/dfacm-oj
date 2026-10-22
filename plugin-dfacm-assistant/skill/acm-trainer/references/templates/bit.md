# 模板：树状数组（BIT）

## 适用信号
- 单点修改 + 前缀和查询（比线段树好写，常数小）；
- 逆序对统计（离散化后按值域建 BIT）；
- 区间加 + 单点查询（差分上建 BIT）。

## 复杂度
每次操作 O(log n)，空间 O(n)。

## 常见坑
1. lowbit 写法 `x & -x`，循环分别 `x += x & -x`（改）与 `x -= x & -x`（查），方向别混；
2. query(x) 只统计 [1..x]，查询 [l..r] 要 query(r) - query(l-1)，l=1 时减 query(0)=0 安全；
3. 逆序对必须先离散化（值域大时），且从右往左扫统计"已出现的比当前小的"。

## 模板（单点改 + 区间和查询）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, q, c[500010];

void update(int x, int v) {
    for (; x <= n; x += x & -x) c[x] += v;
}

int query(int x) {
    int s = 0;
    for (; x > 0; x -= x & -x) s += c[x];
    return s;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> q;
    for (int i = 1; i <= n; i++) {
        int x;
        cin >> x;
        update(i, x);
    }
    while (q--) {
        int op, x, y;
        cin >> op >> x >> y;
        if (op == 1) update(x, y);
        else cout << query(y) - query(x - 1) << "\n";
    }
    return 0;
}
```
