#include <bits/stdc++.h>
using namespace std;
int main() {
    long long lo, hi, f;
    cin >> lo >> hi >> f;
    bool first = true;
    for (long long x = lo; x <= hi; x++)
        if (x % f == 0) {
            if (!first) cout << ' ';
            cout << x;
            first = false;
        }
    cout << endl;
    return 0;
}
