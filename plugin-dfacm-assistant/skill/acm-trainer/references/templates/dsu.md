# 模板：并查集

## 适用信号
- "亲戚 / 连通 / 分组 / 合并集合"类问题：动态合并、随时查询元素所属集合；
- Kruskal 最小生成树、离线 LCA（Tarjan）的底层结构。

## 复杂度
初始化 O(n)；路径压缩 + 按集合大小合并后，m 次操作总时间 O(n+m·α(n))，单次摊还 O(α(n))，空间 O(n)。下面代码实际维护 `sz`；不能把任意挂根写成按秩合并。递归 find 在按大小合并时树高至多 O(log n)，并计入总空间估算。

## 常见坑
1. 忘记初始化 `fa[i] = i`（多组数据必须每组重置）；
2. 合并时连接的是"根"而不是元素本身（必须先 find 再连）；
3. 统计连通块数量：只在 `find(i) == i` 时计数，或维护 size。
4. 多测同时重置 `fa` 与 `sz`；容量根据 n 上限调整，不照抄示例数组上限。

## 模板

```cpp
#include <bits/stdc++.h>
using namespace std;

int fa[10010], sz[10010];

int find(int x) { return fa[x] == x ? x : fa[x] = find(fa[x]); }

void unite(int x, int y) {
    x = find(x); y = find(y);
    if (x == y) return;
    if (sz[x] < sz[y]) swap(x, y);
    fa[y] = x;
    sz[x] += sz[y];
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m;
    cin >> n >> m;
    for (int i = 1; i <= n; i++) { fa[i] = i; sz[i] = 1; }
    while (m--) {
        int op, x, y;
        cin >> op >> x >> y;
        if (op == 1) unite(x, y);
        else cout << (find(x) == find(y) ? 'Y' : 'N') << "\n";
    }
    return 0;
}
```
