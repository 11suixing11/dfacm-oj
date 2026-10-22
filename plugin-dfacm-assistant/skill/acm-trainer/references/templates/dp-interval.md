# 模板：区间 DP

## 适用信号
- "合并石子"类：对区间 [l,r] 的最优解由子区间 [l,k]、[k+1,r] 合并而来；
- 回文/括号匹配/能量项链类逐步合并问题。

## 复杂度
O(n³)，n ≤ 400 左右适用。

## 常见坑
1. **循环顺序：先枚举区间长度 len，再枚举左端点 l**（保证转移的子区间已算好）；
2. 合并代价常用前缀和优化（s[r]-s[l-1]）；
3. f 初始化为 +inf（求 min）时单点 f[i][i]=0 别忘。

## 模板（石子合并最小代价）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n;
long long a[410], s[410], f[410][410];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n;
    for (int i = 1; i <= n; i++) {
        cin >> a[i];
        s[i] = s[i - 1] + a[i];
    }
    memset(f, 0x3f, sizeof f);
    for (int i = 1; i <= n; i++) f[i][i] = 0;
    for (int len = 2; len <= n; len++)
        for (int l = 1; l + len - 1 <= n; l++) {
            int r = l + len - 1;
            for (int k = l; k < r; k++)
                f[l][r] = min(f[l][r], f[l][k] + f[k + 1][r] + s[r] - s[l - 1]);
        }
    cout << f[1][n] << "\n";
    return 0;
}
```
