#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long s = 0;
    for (int i = 0; i < n; i++) { int x; cin >> x; s += x; }
    cout << s / n << endl;
    return 0;
}
