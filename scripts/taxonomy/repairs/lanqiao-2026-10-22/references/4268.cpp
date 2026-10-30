#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n;
    cin >> n;
    if (n <= 1) { cout << "no" << endl; return 0; }
    long long s = 1;
    for (long long d = 2; d * d <= n; d++)
        if (n % d == 0) { s += d; if (d * d != n) s += n / d; }
    cout << (s == n ? "yes" : "no") << endl;
    return 0;
}
