# 模板：树形 DP

## 适用信号
- 树上带依赖的选择问题：子节点状态向上合并到父节点（"没有上司的舞会"）；
- 树上路径/子树统计（换根 DP 是其变体）。

## 复杂度
O(n × 状态数)，树上每个节点访问一次。

## 常见坑
1. 无向树建图每条边存两次，DFS 传父节点 fa 防回头；
2. 以 1 为根且 1 无父——fa=0 作哨兵；
3. 链形树递归深度 1e5 可能爆栈（尤其 Windows 默认栈），可改 BFS 求拓扑序后倒序 DP。

## 模板（相邻节点不能同时选，求最大点权和）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, a[100010];
vector<int> g[100010];
long long f[100010][2]; // f[u][0/1]：u 不选/选 时子树最大值

void dfs(int u, int fa) {
    f[u][0] = 0;
    f[u][1] = a[u];
    for (int v : g[u]) {
        if (v == fa) continue;
        dfs(v, u);
        f[u][0] += max(f[v][0], f[v][1]);
        f[u][1] += f[v][0];
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n;
    for (int i = 1; i <= n; i++) cin >> a[i];
    for (int i = 1; i < n; i++) {
        int u, v;
        cin >> u >> v;
        g[u].push_back(v);
        g[v].push_back(u);
    }
    dfs(1, 0);
    cout << max(f[1][0], f[1][1]) << "\n";
    return 0;
}
```
