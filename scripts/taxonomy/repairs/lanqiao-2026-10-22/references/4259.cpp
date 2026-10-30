#include <bits/stdc++.h>
using namespace std;
long long divsum(long long x) {
    if (x <= 1) return 0;
    long long s = 1;
    for (long long d = 2; d * d <= x; d++)
        if (x % d == 0) { s += d; if (d * d != x) s += x / d; }
    return s;
}
int main() {
    long long a, b;
    cin >> a >> b;
    cout << (divsum(a) == b && divsum(b) == a ? "yes" : "no") << endl;
    return 0;
}
