#include <bits/stdc++.h>
using namespace std;
string f(long long x) {
    string r;
    bool first = true;
    for (int e = 30; e >= 0; e--)
        if (x >> e & 1) {
            if (!first) r += '+';
            first = false;
            if (e == 0) r += "2(0)";
            else if (e == 1) r += "2";
            else if (e == 2) r += "2(2)";
            else r += "2(" + f(e) + ")";
        }
    return r;
}
int main() {
    long long n;
    cin >> n;
    cout << f(n) << endl;
    return 0;
}
