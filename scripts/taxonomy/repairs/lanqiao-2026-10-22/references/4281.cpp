#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, b;
    cin >> n >> b;
    vector<int> v;
    for (int i = 0; i < n; i++) {
        int x; cin >> x;
        if (x % b) v.push_back(x);
    }
    sort(v.begin(), v.end());
    for (int x : v) {
        if (x >= 65 && x <= 90) cout << (char)x;
        else cout << x;
        cout << ' ';
    }
    cout << endl;
    return 0;
}
