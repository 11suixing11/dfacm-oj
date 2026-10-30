#include <bits/stdc++.h>
using namespace std;
long long rev(long long x) {
    long long r = 0;
    while (x > 0) { r = r * 10 + x % 10; x /= 10; }
    return r;
}
int main() {
    long long a, b;
    cin >> a >> b;
    cout << rev(rev(a) + rev(b)) << endl;
    return 0;
}
