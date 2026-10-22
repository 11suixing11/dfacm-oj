# 模板：前缀和与差分

## 适用信号
- 多次查询静态区间和 → 前缀和；
- 多次区间整体加/减、最后统一查询 → 差分（d[l]+=x, d[r+1]-=x，最后前缀和还原）；
- 二维子矩阵和 → 二维前缀和（容斥）。

## 复杂度
预处理 O(n)，每次查询 O(1)。

## 常见坑
1. 下标从 1 开始，s[0]=0 天然处理左边界；
2. 求和结果常超 int（1e5 个 1e9 → 1e14），前缀和数组开 long long；
3. 差分改的是 d 数组，查询前必须先还原，别直接读 d。

## 模板（区间和查询）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, q;
long long s[100010];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> q;
    for (int i = 1; i <= n; i++) {
        long long x;
        cin >> x;
        s[i] = s[i - 1] + x;
    }
    while (q--) {
        int l, r;
        cin >> l >> r;
        cout << s[r] - s[l - 1] << "\n";
    }
    return 0;
}
```
