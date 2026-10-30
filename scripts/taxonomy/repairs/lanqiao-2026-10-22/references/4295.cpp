#include <bits/stdc++.h>
using namespace std;
int main() {
    string a, b;
    cin >> a >> b;
    size_t limit = min(a.size(), b.size());
    for (size_t i = 0; i < limit; i++)
        if (a[i] != b[i]) { cout << int(a[i] - b[i]) << '\n'; return 0; }
    cout << 0 << '\n';
    return 0;
}
