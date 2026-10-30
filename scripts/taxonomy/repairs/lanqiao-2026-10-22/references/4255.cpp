#include <bits/stdc++.h>
using namespace std;
int m, n;
vector<vector<int>> a;
int main() {
    cin >> m >> n;
    a.assign(m, vector<int>(n));
    for (auto &r : a) for (auto &x : r) cin >> x;
    int S = m + n - 2;
    const long long NEG = -1e18;
    vector<vector<vector<long long>>> f(S + 1, vector<vector<long long>>(m, vector<long long>(m, NEG)));
    f[0][0][0] = 0;
    for (int k = 1; k <= S; k++)
        for (int i1 = 0; i1 < m; i1++) {
            int j1 = k - i1;
            if (j1 < 0 || j1 >= n) continue;
            for (int i2 = 0; i2 < m; i2++) {
                int j2 = k - i2;
                if (j2 < 0 || j2 >= n) continue;
                if (i1 == i2 && !(k == S && i1 == m - 1)) continue;
                long long best = NEG;
                for (int d1 = 0; d1 < 2; d1++)
                    for (int d2 = 0; d2 < 2; d2++) {
                        int p1 = i1 - d1, p2 = i2 - d2;
                        int q1 = j1 - (1 - d1), q2 = j2 - (1 - d2);
                        if (p1 < 0 || p2 < 0 || q1 < 0 || q2 < 0) continue;
                        if (f[k-1][p1][p2] == NEG) continue;
                        long long v = f[k-1][p1][p2] + a[i1][j1] + a[i2][j2];
                        best = max(best, v);
                    }
                f[k][i1][i2] = best;
            }
        }
    cout << f[S][m-1][m-1] << endl;
    return 0;
}
