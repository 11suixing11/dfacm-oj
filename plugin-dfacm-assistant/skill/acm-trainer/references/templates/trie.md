# 模板：Trie

## 适用信号
- 前缀查询/统计（"以某串为前缀的单词数"）、字符串集合快速检索；
- 01-Trie 变体解决异或最值问题。

## 复杂度
O(总字符数)，插入/查询都是单词长度线性。

## 常见坑
1. 节点数组大小 = 所有插入串字符总数 + 1，不是单词数；
2. cnt 语义分两种：节点经过次数（前缀计数）与单词结尾计数——按题意选，别混用；
3. 多组数据清空时只需清 tot 用过的部分（或 tot 归零后按需覆盖）。

## 模板（插入 + 查询以某串为前缀的单词结尾数）

```cpp
#include <bits/stdc++.h>
using namespace std;

int n, tot;
int ch[1000010][26], cnt[1000010];

void insert(const string &s) {
    int u = 0;
    for (char c : s) {
        int x = c - 'a';
        if (!ch[u][x]) ch[u][x] = ++tot;
        u = ch[u][x];
    }
    cnt[u]++;
}

int query(const string &s) {
    int u = 0;
    for (char c : s) {
        int x = c - 'a';
        if (!ch[u][x]) return 0;
        u = ch[u][x];
    }
    return cnt[u];
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    cin >> n;
    while (n--) {
        string op, s;
        cin >> op >> s;
        if (op == "insert") insert(s);
        else cout << query(s) << "\n";
    }
    return 0;
}
```
