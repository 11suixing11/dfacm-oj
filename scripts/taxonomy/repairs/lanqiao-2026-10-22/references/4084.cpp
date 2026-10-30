#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<vector<int>> t(n, vector<int>(n));
    for (auto &r : t) for (auto &x : r) cin >> x;
    bool first = true;
    for (int j = 0; j < n; j++) {
        int c = 0;
        for (int i = 0; i < n; i++) c += t[i][j];
        if (c > n / 2) {
            if (!first) cout << ' ';
            cout << j + 1;
            first = false;
        }
    }
    cout << endl;
    return 0;
}
