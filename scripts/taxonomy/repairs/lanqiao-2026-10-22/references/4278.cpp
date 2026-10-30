#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n;
    cin >> n;
    vector<pair<long long, long long>> ps;
    for (long long i = 1; i * i <= n; i++)
        if (n % i == 0) {
            ps.push_back({i, n / i});
            if (i * i != n) ps.push_back({n / i, i});
        }
    sort(ps.begin(), ps.end());
    for (auto &p : ps) cout << p.first << " * " << p.second << " = " << n << "\n";
    return 0;
}
