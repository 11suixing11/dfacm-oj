# 模板：ST 表（Sparse Table）

## 适用信号
- 静态区间最值（RMQ），无修改操作；
- 查询次数多、可 O(1) 回答是核心收益。

## 复杂度
预处理 O(n log n)，单次查询 O(1)。

## 常见坑
1. 查询用两段可重叠的区间取 max/min——这是 ST 表可行的原因，但**不能用于区间和**（会重复计算）；
2. lg 数组预计算到 n，lg[1]=0；
3. 第二维 j 的循环上限 (1<<j) <= n，别越界。

## 模板（静态区间最大值）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, q, a[100010], st[20][100010], lg[100010];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> q;
    for (int i = 1; i <= n; i++) cin >> a[i];
    for (int i = 2; i <= n; i++) lg[i] = lg[i / 2] + 1;
    for (int i = 1; i <= n; i++) st[0][i] = a[i];
    for (int j = 1; (1 << j) <= n; j++)
        for (int i = 1; i + (1 << j) - 1 <= n; i++)
            st[j][i] = max(st[j - 1][i], st[j - 1][i + (1 << (j - 1))]);
    while (q--) {
        int l, r;
        cin >> l >> r;
        int k = lg[r - l + 1];
        cout << max(st[k][l], st[k][r - (1 << k) + 1]) << "\n";
    }
    return 0;
}
```
