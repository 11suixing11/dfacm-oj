#include <bits/stdc++.h>
using namespace std;
int main() {
    long long x1, y1, x2, y2;
    cin >> x1 >> y1 >> x2 >> y2;
    if (x1 == x2) {
        cout << "INF" << '\n';
        return 0;
    }
    long long rise = y2 - y1, run = x2 - x1;
    if (rise % run == 0)
        cout << rise / run << '\n';
    else
        cout << (double)rise / run << '\n';
    return 0;
}
