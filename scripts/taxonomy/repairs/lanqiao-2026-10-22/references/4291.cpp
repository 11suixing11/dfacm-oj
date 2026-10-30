#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> items(n);
    for (int i = 0; i < n; i++) cin >> items[i];
    int g = 0;
    for (int v : items) g = __gcd(g, v);
    bool hasOne = false;
    for (int v : items) if (v == 1) hasOne = true;
    if (g > 1 || hasOne) {
        cout << 0 << '\n';
        return 0;
    }
    const int BOUND = 500 * 500 + 1;
    vector<char> reach(BOUND + 1, 0);
    reach[0] = 1;
    for (int v : items)
        for (int x = v; x <= BOUND; x++)
            if (reach[x - v]) reach[x] = 1;
    int answer = 0;
    for (int x = BOUND; x >= 1; x--)
        if (!reach[x]) { answer = x; break; }
    cout << answer << '\n';
    return 0;
}
