#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<bool> gen(n + 1, false);
    for (int x = 1; x < n; x++) {
        int d = x, t = x;
        while (t) { d += t % 10; t /= 10; }
        if (d <= n) gen[d] = true;
    }
    for (int i = 1; i < n; i++) if (!gen[i]) cout << i << "\n";
    return 0;
}
