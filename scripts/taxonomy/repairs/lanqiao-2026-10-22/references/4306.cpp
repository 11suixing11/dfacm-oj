#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    int total = 0;
    for (int i = 0; i < n; i++) {
        int a = i, b = i + 1, c = i + 2;
        bool ok = true;
        for (int p = 0; p < 5; p++) {
            if (a % 10 + b % 10 + c % 10 > 9) { ok = false; break; }
            a /= 10; b /= 10; c /= 10;
        }
        if (ok) total++;
    }
    cout << total << '\n';
    return 0;
}
