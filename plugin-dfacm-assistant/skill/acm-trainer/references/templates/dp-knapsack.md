# 模板：背包 DP（01 / 完全）

## 适用信号
- 体积/时间/代价约束下选物品求最值：01 背包（每件一件）、完全背包（每件无限）；
- 多维约束加一维状态（费用、重量双限制）。

## 复杂度
O(n × V)，空间可压到一维。

## 常见坑
1. **01 背包体积倒序枚举、完全背包正序枚举**——方向错了状态会重复转移（01 变完全）；
2. "恰好装满" 初始化 f[0]=0 其余 -inf，"至多装下" 全 0，语义不同答案不同；
3. 体积上界 1e5 且价值大时开 long long。

## 模板（01 背包：n 件物品、容量 V 的最大价值）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, V;
long long f[100010];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> V;
    for (int i = 1; i <= n; i++) {
        int w, v;
        cin >> w >> v;
        for (int j = V; j >= w; j--)   // 01 背包：倒序
            f[j] = max(f[j], f[j - w] + v);
    }
    cout << f[V] << "\n";
    return 0;
}
```

> 完全背包：把内层循环改为 `for (int j = w; j <= V; j++)` 即可。多重背包：二进制拆分转 01 背包；单调队列优化可到 O(nV)。
