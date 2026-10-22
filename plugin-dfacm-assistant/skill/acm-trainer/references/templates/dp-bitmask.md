# 模板：状压 DP

## 适用信号
- n ≤ 20 左右，"已使用集合"作为状态维度（TSP、棋盘覆盖、互斥选择）；
- 集合用二进制整数表示，枚举集合/子集做转移。
- 小宽度棋盘可按行状压，先筛行内合法掩码，再检查相邻行兼容；模板代码为 TSP，棋盘题需按题意另写转移与计数维度。

## 复杂度
复杂度由状态与转移维度共同决定。本 TSP 实现上界 O(n²·2^n)，n=18 时约 8.5e7 次候选检查；全局 `d[18][1<<18]` 固定约 37.7MB，初始化也扫描全部数组。是否可行须对照具体时限和内存限制。

## 常见坑
1. 位运算与比较混用时加括号，例如 `(s & (s >> 1)) == 0` 判断同一行没有相邻 1；
2. 状态数组大小是 2^n——n=20 时 `long long d[20][1<<20]` 约 168MB，须结合内存上限判断；本模板仅适用于 n≤18，更大范围需重算预算与数组容量；
3. 枚举子集的子集：`for (int T = S; T; T = (T - 1) & S)`，别写成枚举所有集合再判包含。
4. 棋盘上一行掩码 t 只含低 n 位时，`(s | (s << 1) | (s >> 1)) & t` 与先裁剪到低 n 位再与 t 等价；裁剪不会额外丢失冲突。

## 模板（TSP 最短哈密顿回路，n ≤ 18）

```cpp
#include <bits/stdc++.h>
using namespace std;

const long long INF = 0x3f3f3f3f3f3f3f3f;
int n;
int w[18][18];
long long d[18][1 << 18];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n;
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++) cin >> w[i][j];
    memset(d, 0x3f, sizeof d);
    d[0][1] = 0; // 从 0 号城出发，已访问集合 {0}
    for (int S = 1; S < (1 << n); S++)
        for (int u = 0; u < n; u++) {
            if (!(S >> u & 1) || d[u][S] == INF) continue;
            for (int v = 0; v < n; v++) {
                if (S >> v & 1) continue;
                int T = S | (1 << v);
                d[v][T] = min(d[v][T], d[u][S] + w[u][v]);
            }
        }
    long long ans = INF;
    for (int u = 1; u < n; u++)
        ans = min(ans, d[u][(1 << n) - 1] + w[u][0]);
    cout << (ans == INF ? -1 : ans) << "\n";
    return 0;
}
```
