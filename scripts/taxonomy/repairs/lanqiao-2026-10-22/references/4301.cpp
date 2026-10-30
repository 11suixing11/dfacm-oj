#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long a = 1, b = 1;
    for (int i = 2; i <= n; i++) { long long c = a + b; a = b; b = c; }
    cout << b << '\n';
    return 0;
}
