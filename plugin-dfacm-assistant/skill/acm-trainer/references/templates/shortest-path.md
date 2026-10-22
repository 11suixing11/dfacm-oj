# 模板：最短路（Dijkstra 堆优化）

## 适用信号
- 带非负权边的单源最短路 → Dijkstra + 优先队列（首选）；
- 边权全部相等 → BFS 即可（更简单更快）；
- 有负权边 → SPFA / Bellman-Ford；多源 → n 小用 Floyd O(n³)。

## 复杂度
Dijkstra 堆优化 O(m log n)；链式前向星或 vector 邻接表均可。

## 常见坑
1. **距离数组开 long long**（1e5 条 1e9 边累加 = 1e14）；
2. vis 判断用"弹出时检查 du > d[u] 跳过"，不要在入堆时标记（同一节点可能多次入堆）；
3. 无向图每条边要存两次（正反两个方向），边数组开 2m。

## 模板（Dijkstra 堆优化，有向图，输出各点距离或 -1）

```cpp
#include <bits/stdc++.h>
using namespace std;

const long long INF = 0x3f3f3f3f3f3f3f3f;
int n, m, s;
vector<pair<int,int>> g[100010];
long long d[100010];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> m >> s;
    for (int i = 1; i <= m; i++) {
        int u, v, w;
        cin >> u >> v >> w;
        g[u].push_back({v, w});
    }
    memset(d, 0x3f, sizeof d);
    d[s] = 0;
    priority_queue<pair<long long,int>, vector<pair<long long,int>>, greater<>> pq;
    pq.push({0, s});
    while (!pq.empty()) {
        auto [du, u] = pq.top();
        pq.pop();
        if (du > d[u]) continue;
        for (auto [v, w] : g[u]) {
            if (d[u] + w < d[v]) {
                d[v] = d[u] + w;
                pq.push({d[v], v});
            }
        }
    }
    for (int i = 1; i <= n; i++)
        cout << (d[i] == INF ? -1 : d[i]) << (i == n ? '\n' : ' ');
    return 0;
}
```
