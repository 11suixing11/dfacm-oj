#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<long long>> f(m + 1, vector<long long>(n, 0));
    f[0][0] = 1;
    for (int t = 1; t <= m; t++)
        for (int i = 0; i < n; i++)
            f[t][i] = f[t-1][(i-1+n)%n] + f[t-1][(i+1)%n];
    cout << f[m][0] << endl;
    return 0;
}
