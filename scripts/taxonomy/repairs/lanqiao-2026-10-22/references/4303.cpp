#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<long long>> a(n, vector<long long>(m)), b(n, vector<long long>(m));
    for (auto &row : a) for (auto &x : row) cin >> x;
    for (auto &row : b) for (auto &x : row) cin >> x;
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            cout << a[i][j] + b[i][j] << (j + 1 == m ? '\n' : ' ');
    return 0;
}
