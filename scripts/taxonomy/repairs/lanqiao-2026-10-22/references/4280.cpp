#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    map<int, int> cnt;
    for (int i = 0; i < n; i++) { int x; cin >> x; cnt[x]++; }
    for (auto &p : cnt) cout << p.first << ' ' << p.second << "\n";
    return 0;
}
