#include <bits/stdc++.h>
using namespace std;
typedef vector<vector<long long>> Mtx;
Mtx mul(const Mtx &a, const Mtx &b) {
    int n = a.size();
    Mtx c(n, vector<long long>(n, 0));
    for (int i = 0; i < n; i++)
        for (int k = 0; k < n; k++)
            for (int j = 0; j < n; j++)
                c[i][j] += a[i][k] * b[k][j];
    return c;
}
int main() {
    int n; long long m;
    cin >> n >> m;
    Mtx a(n, vector<long long>(n));
    for (auto &r : a) for (auto &x : r) cin >> x;
    Mtx r(n, vector<long long>(n, 0));
    for (int i = 0; i < n; i++) r[i][i] = 1;
    for (long long i = 0; i < m; i++) r = mul(r, a);
    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            cout << r[i][j] << (j + 1 == n ? "\n" : " ");
    return 0;
}
