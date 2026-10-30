#include <bits/stdc++.h>
using namespace std;
int main() {
    long long re = 0, im = 0;
    for (int i = 0; i < 10; i++) {
        long long a, b; cin >> a >> b;
        re += a; im += b;
    }
    cout << re;
    if (im >= 0) cout << '+';
    cout << im << 'i' << endl;
    return 0;
}
