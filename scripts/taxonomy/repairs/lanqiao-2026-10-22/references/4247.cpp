#include <bits/stdc++.h>
using namespace std;
string s;
char type(int l, int r) {
    bool z = false, o = false;
    for (int i = l; i <= r; i++) (s[i]=='0') ? z = true : o = true;
    return (z && o) ? 'F' : (z ? 'B' : 'I');
}
void post(int l, int r) {
    if (l == r) { putchar(type(l, r)); return; }
    int m = (l + r) / 2;
    post(l, m); post(m + 1, r);
    putchar(type(l, r));
}
int main() {
    int n; cin >> n >> s;
    post(0, s.size() - 1);
    putchar('\n');
    return 0;
}
