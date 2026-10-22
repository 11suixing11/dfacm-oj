# 模板：二分（整数二分 / 二分答案）

## 适用信号
- "最大化最小值 / 最小化最大值"类问题；
- 答案具有单调性：给定候选 x，能 O(n) 或 O(n log n) 内验证可行性；
- 求满足条件的边界位置（第一个 ≥x / 最后一个 ≤x）。

## 复杂度
O(check(n) × log(值域))；值域 1e9 时约 30 轮。

## 常见坑
1. 左右边界与区间写法不配套导致死循环（`l <= r` 配 `l = mid + 1` / `r = mid - 1`；`l < r` 配 `r = mid` / `l = mid + 1`）；
2. 二分答案域含 0 时 check 除零（下界从 1 起，无解单独输出）；
3. check 内乘加溢出（如 k×mid、Σ(a_i/x) 可超 int）。

## 模板（二分答案）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n; long long k;
int a[100010];

bool check(long long x) {
    long long cnt = 0;
    for (int i = 1; i <= n; i++) cnt += a[i] / x;
    return cnt >= k;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> k;
    for (int i = 1; i <= n; i++) cin >> a[i];
    long long l = 1, r = *max_element(a + 1, a + n + 1), ans = 0;
    while (l <= r) {
        long long mid = (l + r) / 2;
        if (check(mid)) { ans = mid; l = mid + 1; }
        else r = mid - 1;
    }
    cout << ans << "\n";
    return 0;
}
```

> 实数二分用 `while (r - l > eps)` 或固定迭代 100 次防精度死循环；序列上找边界（第一个满足位置）改用 `l < r` 写法。
