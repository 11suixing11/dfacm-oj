#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, k;
    cin >> n >> k;
    vector<vector<long long>> f(n + 1, vector<long long>(k + 1, 0));
    f[0][0] = 1;
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= min(i, k); j++)
            f[i][j] = f[i - 1][j - 1] + f[i - j][j];
    cout << f[n][k] << endl;
    return 0;
}
