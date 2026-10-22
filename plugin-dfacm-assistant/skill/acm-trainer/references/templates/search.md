# 模板：搜索（DFS / BFS / 剪枝 / 记忆化）

## 适用信号
- 网格/显式图遍历：边权相等的最短路用 BFS，遍历所有路径用 DFS；
- 状态空间搜索：可行性剪枝（当前已不满足必剪）、最优性剪枝（当前代价 ≥ 已知最优必剪）、搜索顺序（更可能剪枝的分支先搜）；
- 记忆化搜索 = 递归写 DP：状态可枚举且重叠子问题多时用。

## 复杂度
状态数 × 分支数；剪枝决定实际规模。

## 常见坑
1. BFS 求最短路**只在边权全相等时成立**，有变权用 Dijkstra/01BFS/拆点；
2. DFS 全排列/路径搜索，回溯时标记必须恢复（vis[u]=false）；
3. 网格走位数组 dx/dy 别写错方向；`cin >> (g[i]+1)` 读行字符串配合 1 下标。

## 模板（网格 BFS 最短步数，'#' 为障碍）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, m, dist[1010][1010];
char g[1010][1010];
int dx[4] = {0, 0, 1, -1}, dy[4] = {1, -1, 0, 0};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> m;
    for (int i = 1; i <= n; i++) cin >> (g[i] + 1);
    memset(dist, -1, sizeof dist);
    queue<pair<int,int>> q;
    q.push({1, 1});
    dist[1][1] = 0;
    while (!q.empty()) {
        auto [x, y] = q.front();
        q.pop();
        for (int k = 0; k < 4; k++) {
            int nx = x + dx[k], ny = y + dy[k];
            if (nx < 1 || nx > n || ny < 1 || ny > m) continue;
            if (g[nx][ny] == '#' || dist[nx][ny] != -1) continue;
            dist[nx][ny] = dist[x][y] + 1;
            q.push({nx, ny});
        }
    }
    cout << dist[n][m] << "\n";
    return 0;
}
```

> 记忆化：把 BFS 换成 DFS(pos, state) + memo，返回值语义写清（"从该状态出发的最优值"），入口调用即答案。
