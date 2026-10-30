#include <bits/stdc++.h>
using namespace std;
int main() {
    long long v1, v2, t, s, l;
    cin >> v1 >> v2 >> t >> s >> l;
    long long r = 0, w = 0, rest = 0, sec = 0;
    while (r < l && w < l) {
        sec++;
        bool moved = false;
        if (rest > 0) rest--;
        else { r += v1; moved = true; }
        w += v2;
        if (moved && r - w >= t && r < l) rest = s;
    }
    if (r >= l && w >= l) cout << "D\n";
    else if (w >= l) cout << "T\n";
    else cout << "R\n";
    cout << sec << endl;
    return 0;
}
