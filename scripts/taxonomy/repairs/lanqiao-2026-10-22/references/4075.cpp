#include <bits/stdc++.h>
using namespace std;
int main() {
    long long a, b;
    cin >> a >> b;
    for (long long k = a; k <= b; k++) {
        cout << k << '=';
        long long x = k;
        bool first = true;
        for (long long d = 2; d * d <= x; d++)
            while (x % d == 0) {
                cout << (first ? "" : "*") << d;
                first = false;
                x /= d;
            }
        if (x > 1) cout << (first ? "" : "*") << x;
        cout << "\n";
    }
    return 0;
}
