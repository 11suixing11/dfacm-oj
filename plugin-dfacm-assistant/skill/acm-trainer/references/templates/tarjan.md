# 模板：Tarjan（强连通分量）

## 适用信号
- 有向图强连通分量（SCC）→ 缩点后变 DAG，再跑拓扑/DP（"缩点+DAG 上最长路"是经典套路）；
- 无向图割点/桥（本题模板为有向图 SCC 版）。

## 复杂度
O(n + m)，一次 DFS。

## 常见坑
1. instk 标记：横叉边只有指向栈内点才能更新 low，用 dfn[v] 更新；
2. low[u] 回溯时用子节点的 low 更新，别用 dfn（那是割点/桥的写法）；
3. 缩点后重建图时重边可以不删（不影响正确性）；递归实现链形图深度 1e5 可能爆栈，必要时改显式栈或开大栈（Windows 侧注意编译选项）。

## 模板（SCC 计数与归属）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, m, cnt, scnt, dfn[100010], low[100010], scc[100010];
vector<int> g[100010];
stack<int> stk;
bool instk[100010];

void tarjan(int u) {
    dfn[u] = low[u] = ++cnt;
    stk.push(u);
    instk[u] = true;
    for (int v : g[u]) {
        if (!dfn[v]) {
            tarjan(v);
            low[u] = min(low[u], low[v]);
        } else if (instk[v]) {
            low[u] = min(low[u], dfn[v]);
        }
    }
    if (dfn[u] == low[u]) {
        scnt++;
        while (true) {
            int v = stk.top();
            stk.pop();
            instk[v] = false;
            scc[v] = scnt;
            if (v == u) break;
        }
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> m;
    for (int i = 1; i <= m; i++) {
        int u, v;
        cin >> u >> v;
        g[u].push_back(v);
    }
    for (int i = 1; i <= n; i++)
        if (!dfn[i]) tarjan(i);
    cout << scnt << "\n";
    return 0;
}
```
