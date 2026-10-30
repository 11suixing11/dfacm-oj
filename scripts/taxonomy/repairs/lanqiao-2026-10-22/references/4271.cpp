#include <bits/stdc++.h>
using namespace std;
int main() {
    int N, m;
    cin >> N >> m;
    vector<long long> dp(N + 1, 0);
    for (int i = 0; i < m; i++) {
        int v, p;
        cin >> v >> p;
        for (int j = N; j >= v; j--) dp[j] = max(dp[j], dp[j - v] + (long long)v * p);
    }
    cout << *max_element(dp.begin(), dp.end()) << endl;
    return 0;
}
