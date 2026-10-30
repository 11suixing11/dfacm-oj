#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n, m;
    cin >> n >> m;
    if (n == 0) {
        cout << 0 << '\n';
        return 0;
    }
    long long k = (n + m - 1) / m;
    cout << ((1LL << k) - 1) << endl;
    return 0;
}
