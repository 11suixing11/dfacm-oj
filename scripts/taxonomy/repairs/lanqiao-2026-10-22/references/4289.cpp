#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    vector<int> fingers(n);
    for (int i = 0; i < n; i++) cin >> fingers[i];
    while (m--) {
        if (!next_permutation(fingers.begin(), fingers.end())) return 1;
    }
    for (int i = 0; i < n; i++) {
        if (i) cout << ' ';
        cout << fingers[i];
    }
    cout << '\n';
    return 0;
}
