# 模板：线段树（懒标记）

## 适用信号
- 区间修改 + 区间查询（区间加求和最典型；区间最值把 + 换 max）；
- 树状数组表达不了的复合区间信息（区间乘、历史最值等）。

## 复杂度
O((n + q) log n)，空间开 4n。

## 常见坑
1. 懒标记下放 pushdown 必须在递归子区间前调用，忘调是最高频 bug；
2. 标记叠加语义：区间加标记可直接累加；区间乘要先乘后加（两个标记时注意顺序）；
3. 求和值与标记都开 long long（1e5 个 1e9 累加即 1e14）。

## 模板（区间加 + 区间求和）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, q;
long long a[100010], sum[400010], tag[400010];

void pushup(int p) { sum[p] = sum[p * 2] + sum[p * 2 + 1]; }

void build(int p, int l, int r) {
    if (l == r) { sum[p] = a[l]; return; }
    int mid = (l + r) / 2;
    build(p * 2, l, mid);
    build(p * 2 + 1, mid + 1, r);
    pushup(p);
}

void pushdown(int p, int l, int r) {
    if (tag[p]) {
        int mid = (l + r) / 2;
        sum[p * 2] += tag[p] * (mid - l + 1);
        sum[p * 2 + 1] += tag[p] * (r - mid);
        tag[p * 2] += tag[p];
        tag[p * 2 + 1] += tag[p];
        tag[p] = 0;
    }
}

void update(int p, int l, int r, int ql, int qr, long long v) {
    if (ql <= l && r <= qr) { sum[p] += v * (r - l + 1); tag[p] += v; return; }
    pushdown(p, l, r);
    int mid = (l + r) / 2;
    if (ql <= mid) update(p * 2, l, mid, ql, qr, v);
    if (qr > mid) update(p * 2 + 1, mid + 1, r, ql, qr, v);
    pushup(p);
}

long long query(int p, int l, int r, int ql, int qr) {
    if (ql <= l && r <= qr) return sum[p];
    pushdown(p, l, r);
    int mid = (l + r) / 2;
    long long res = 0;
    if (ql <= mid) res += query(p * 2, l, mid, ql, qr);
    if (qr > mid) res += query(p * 2 + 1, mid + 1, r, ql, qr);
    return res;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n >> q;
    for (int i = 1; i <= n; i++) cin >> a[i];
    build(1, 1, n);
    while (q--) {
        int op, l, r;
        cin >> op >> l >> r;
        if (op == 1) {
            long long v;
            cin >> v;
            update(1, 1, n, l, r, v);
        } else {
            cout << query(1, 1, n, l, r) << "\n";
        }
    }
    return 0;
}
```
