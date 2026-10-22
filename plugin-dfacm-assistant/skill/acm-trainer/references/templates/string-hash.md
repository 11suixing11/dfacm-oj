# 模板：字符串 Hash

## 适用信号
- 快速判断任意两子串是否相等（回文判断、可重叠重复子串、二分+Hash 找公共部分）；
- 比后缀数组/后缀自动机好写得多，竞赛首选。

## 复杂度
预处理 O(n)，单次子串比较 O(1)。

## 常见坑
1. **被卡哈希**：单模 ull 自然溢出可能被构造数据卡，重要比赛用双哈希（两个不同底数/模数取与）；
2. 底数 B 取 131 / 13331，模数取大素数（或 ull 自然溢出，二选一统一）；
3. 取模版求子串哈希需要逆元（费马小定理预处理 pw 的逆），自然溢出版直接减。

## 模板（子串相等判断，ull 自然溢出单哈希）

```cpp
#include <bits/stdc++.h>
using namespace std;

typedef unsigned long long ull;
const ull B = 131;

int n, q;
char s[100010];
ull h[100010], pw[100010];

ull get(int l, int r) { return h[r] - h[l - 1] * pw[r - l + 1]; }

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> (s + 1) >> q;
    n = strlen(s + 1);
    pw[0] = 1;
    for (int i = 1; i <= n; i++) {
        h[i] = h[i - 1] * B + s[i];
        pw[i] = pw[i - 1] * B;
    }
    while (q--) {
        int l1, r1, l2, r2;
        cin >> l1 >> r1 >> l2 >> r2;
        cout << (get(l1, r1) == get(l2, r2) ? "Yes" : "No") << "\n";
    }
    return 0;
}
```
