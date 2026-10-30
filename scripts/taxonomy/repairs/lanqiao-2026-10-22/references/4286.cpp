#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<vector<long long>> grid(n + 1, vector<long long>(n + 1, 0));
    while (true) {
        int x, y;
        long long v;
        cin >> x >> y >> v;
        if (x == 0 && y == 0 && v == 0) break;
        grid[x][y] = v;
    }
    // dp[k][i][j]: both walkers are k anti-diagonal steps in, in rows i and j.
    vector<vector<long long>> best(n + 1, vector<long long>(n + 1, LLONG_MIN));
    vector<vector<long long>> after(n + 1, vector<long long>(n + 1, LLONG_MIN));
    best[1][1] = grid[1][1];
    for (int k = 3; k <= 2 * n; k++) {
        for (int i = 1; i <= n; i++) for (int j = 1; j <= n; j++) after[i][j] = LLONG_MIN;
        int lowPrev = max(1, k - 1 - n), highPrev = min(n, k - 2);
        for (int i = max(1, k - n); i <= min(n, k - 1); i++) {
            for (int j = max(1, k - n); j <= min(n, k - 1); j++) {
                long long top = LLONG_MIN;
                int pi[4] = {i - 1, i - 1, i, i}, pj[4] = {j - 1, j, j - 1, j};
                for (int t = 0; t < 4; t++) {
                    if (pi[t] < lowPrev || pi[t] > highPrev) continue;
                    if (pj[t] < lowPrev || pj[t] > highPrev) continue;
                    if (best[pi[t]][pj[t]] != LLONG_MIN)
                        top = max(top, best[pi[t]][pj[t]]);
                }
                if (top == LLONG_MIN) continue;
                long long gain = grid[i][k - i];
                if (i != j) gain += grid[j][k - j];
                after[i][j] = top + gain;
            }
        }
        swap(best, after);
    }
    cout << best[n][n] << '\n';
    return 0;
}
