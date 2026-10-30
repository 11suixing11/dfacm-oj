#include <bits/stdc++.h>
using namespace std;
int main() {
    long long k;
    cin >> k;
    cout << 2 * ((1LL << k) - k - 1) << endl;
    return 0;
}
