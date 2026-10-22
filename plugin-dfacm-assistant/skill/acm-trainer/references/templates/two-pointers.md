# 模板：双指针与滑动窗口

## 适用信号
- "最长 / 最短的满足某条件的连续子段/子序列"，条件关于窗口扩张/收缩单调；
- 正整数数组上求和型窗口；有序数组两数凑和；
- 指针只会前进不回退（这是正确性来源：放弃的解不可能更优）。

## 复杂度
O(n)（每个指针最多移动 n 次）。

## 常见坑
1. 移动条件写反会死循环——先明确"何时收缩左端"，收缩必须在满足条件时进行；
2. 先累计再收缩，还是先收缩再判断，答案语义不同（求最短 vs 最长）；
3. 前提是元素非负（或条件单调），有负数时滑窗不成立，改前缀和+单调队列/二分。

## 模板（正整数数列中最短的、和 ≥ s 的连续子段）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n;
long long s, a[100010];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> s;
    for (int i = 1; i <= n; i++) cin >> a[i];
    long long sum = 0;
    int ans = n + 1;
    for (int r = 1, l = 1; r <= n; r++) {
        sum += a[r];
        while (sum >= s && l <= r) {
            ans = min(ans, r - l + 1);
            sum -= a[l++];
        }
    }
    cout << (ans == n + 1 ? 0 : ans) << "\n";
    return 0;
}
```
