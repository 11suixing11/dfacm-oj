# 模板：数位 DP

## 适用信号
- "0 ~ N 中满足数位条件（数位和、含某数字、整除性）的数有多少个"，N 可达 1e18；
- 逐位决策 + 上界限制（tight）+ 记忆化。

## 复杂度
O(位数 × 状态)，常数极小。

## 常见坑
1. **记忆化只在非 tight（且已开始）状态生效**——带上界限制的路径不能复用记忆；
2. 前导零（started 标记）影响"含 0"类条件，必须显式传参；
3. 求 [l, r] 用 solve(r) - solve(l-1)，注意 l=0 边界。

## 模板（统计 [1, n] 中数位和恰好为 k 的个数）

```cpp
#include <bits/stdc++.h>
using namespace std;

long long n, memo[20][200];
int k;
vector<int> dig;

long long dfs(int pos, int sum, bool tight, bool started) {
    if (sum > k) return 0;
    if (pos == (int)dig.size()) return started && sum == k;
    if (!tight && started && memo[pos][sum] != -1) return memo[pos][sum];
    int hi = tight ? dig[pos] : 9;
    long long res = 0;
    for (int x = 0; x <= hi; x++)
        res += dfs(pos + 1, sum + x, tight && x == hi, started || x > 0);
    if (!tight && started) memo[pos][sum] = res;
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> k;
    long long t = n;
    while (t > 0) { dig.push_back(t % 10); t /= 10; }
    reverse(dig.begin(), dig.end());
    memset(memo, -1, sizeof memo);
    cout << dfs(0, 0, true, false) << "\n";
    return 0;
}
```
