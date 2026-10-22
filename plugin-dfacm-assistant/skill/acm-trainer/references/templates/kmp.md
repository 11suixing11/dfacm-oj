# 模板：KMP

## 适用信号
- 模式串在文本中的匹配/出现次数/首次位置；
- 求 border（最长相等前后缀）、周期相关性质。

## 复杂度
O(n + m)。

## 常见坑
1. next 数组语义要统一（本模板用"长度"语义，字符串加前导空格转 1 下标）；
2. 失配时 j = nxt[j] 逐步回退，不是直接归零；
3. 统计出现次数在 j==m 后同样 j = nxt[j] 继续匹配。

## 模板（统计模式串出现次数）

```cpp
#include <bits/stdc++.h>
using namespace std;

int nxt[1000010];

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string s, p;
    cin >> s >> p;
    int m = p.size();
    p = " " + p;
    for (int i = 2, j = 0; i <= m; i++) {
        while (j && p[i] != p[j + 1]) j = nxt[j];
        if (p[i] == p[j + 1]) j++;
        nxt[i] = j;
    }
    int n = s.size();
    s = " " + s;
    int cnt = 0;
    for (int i = 1, j = 0; i <= n; i++) {
        while (j && s[i] != p[j + 1]) j = nxt[j];
        if (s[i] == p[j + 1]) j++;
        if (j == m) { cnt++; j = nxt[j]; }
    }
    cout << cnt << "\n";
    return 0;
}
```
