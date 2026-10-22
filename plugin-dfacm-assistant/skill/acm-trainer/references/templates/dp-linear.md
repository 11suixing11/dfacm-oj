# 模板：线性 DP

## 适用信号
- 状态沿序列位置一维推进：LIS、LCS、最大子段和、走楼梯/打家劫舍类；
- "以 i 结尾/前 i 个"的刻画 + 从前面若干状态转移。

## 复杂度
O(n) ~ O(n²)；LIS 在 n 大时用贪心+二分降到 O(n log n)。

## 常见坑
1. 初始边界（f[0]、f[i]=1）别漏；
2. 求方案数时转移用加法并取模，求最值用 max/min，别混；
3. LIS 的 O(n²) 写法 n=1e5 会超时，直接上贪心+二分（见 solve.md 示例）。

## 模板（最大子段和）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n;
long long a[200010], f[200010];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n;
    for (int i = 1; i <= n; i++) cin >> a[i];
    long long ans = LLONG_MIN;
    for (int i = 1; i <= n; i++) {
        f[i] = max(a[i], f[i - 1] + a[i]);
        ans = max(ans, f[i]);
    }
    cout << ans << "\n";
    return 0;
}
```

> LIS O(n log n)：f[k] 存长度为 k 的上升子序列最小尾值，每元素 lower_bound 替换或追加（严格递增用 lower_bound，不下降用 upper_bound）。
