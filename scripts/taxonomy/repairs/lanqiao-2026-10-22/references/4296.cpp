#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n;
    cin >> n;
    if (n < 100 || n > 999) { cout << "NO\n"; return 0; }
    long long total = 0, value = n;
    while (value) { long long digit = value % 10; total += digit * digit * digit; value /= 10; }
    cout << (total == n ? "YES" : "NO") << '\n';
    return 0;
}
