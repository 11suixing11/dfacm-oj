# 模板：最小生成树（Kruskal）

## 适用信号
- 用最小总边权把所有点连通（无向图）；稀疏图 Kruskal 优于 Prim。

## 复杂度
O(m log m)（排序主导），配合并查集判连通。

## 常见坑
1. 并查集要先初始化 fa[i]=i（多测重置）；
2. 图不连通时生成树不存在——用"已选边数 = n-1"判断，输出按题意处理（-1 等）；
3. 总边权开 long long（1e5 条 1e9 = 1e14）；重边自环天然被算法忽略。

## 模板（Kruskal，不可连通输出 -1）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, m, fa[500010];

int find(int x) { return fa[x] == x ? x : fa[x] = find(fa[x]); }

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> m;
    vector<array<int,3>> e(m); // {w, u, v}
    for (auto &x : e) cin >> x[1] >> x[2] >> x[0];
    for (int i = 1; i <= n; i++) fa[i] = i;
    sort(e.begin(), e.end());
    long long ans = 0;
    int cnt = 0;
    for (auto &x : e) {
        int u = find(x[1]), v = find(x[2]);
        if (u != v) { fa[u] = v; ans += x[0]; cnt++; }
    }
    cout << (cnt == n - 1 ? ans : -1) << "\n";
    return 0;
}
```
