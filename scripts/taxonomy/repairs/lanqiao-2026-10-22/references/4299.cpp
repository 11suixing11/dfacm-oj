#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n, m;
    cin >> n >> m;
    long long power = 1;
    for (int i = 0; i <= n; i++) power *= n;
    cout << power - (n - 1) * m << '\n';
    return 0;
}
