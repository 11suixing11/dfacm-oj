#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    vector<long long> tap(m, 0);
    for (int i = 0; i < n; i++) {
        long long w; cin >> w;
        int k = 0;
        for (int j = 1; j < m; j++) if (tap[j] < tap[k]) k = j;
        tap[k] += w;
    }
    cout << *max_element(tap.begin(), tap.end()) << endl;
    return 0;
}
