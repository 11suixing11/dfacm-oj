# 模板：拓扑排序

## 适用信号
- 依赖关系（先修课程、任务先后）求一个合法执行顺序；
- 判断有向图是否有环（有环则拓扑序不存在）；
- 拓扑序上做 DP（DAG 最长路等，拓扑序保证转移顺序正确）。

## 复杂度
O(n + m)，BFS（Kahn）实现。

## 常见坑
1. 入度统计方向别搞反：边 u→v 使 deg[v]++；
2. 判环：出队元素总数 < n 即有环，不要只看队列是否为空；
3. 要求字典序最小的拓扑序时，把 queue 换成 priority_queue（小根堆）。

## 模板（BFS 拓扑排序，有环输出 -1）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, m, deg[100010];
vector<int> g[100010];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> m;
    for (int i = 1; i <= m; i++) {
        int u, v;
        cin >> u >> v;
        g[u].push_back(v);
        deg[v]++;
    }
    queue<int> q;
    for (int i = 1; i <= n; i++)
        if (!deg[i]) q.push(i);
    vector<int> order;
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        order.push_back(u);
        for (int v : g[u])
            if (!--deg[v]) q.push(v);
    }
    if ((int)order.size() < n) { cout << "-1\n"; return 0; }
    for (int i = 0; i < n; i++)
        cout << order[i] << (i == n - 1 ? '\n' : ' ');
    return 0;
}
```
