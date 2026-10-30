#include <bits/stdc++.h>
using namespace std;
int main() {
    int T, M;
    cin >> T >> M;
    vector<int> dp(T + 1, 0);
    for (int i = 0; i < M; i++) {
        int t, v;
        cin >> t >> v;
        for (int j = T; j >= t; j--) dp[j] = max(dp[j], dp[j - t] + v);
    }
    cout << *max_element(dp.begin(), dp.end()) << endl;
    return 0;
}
