#include <bits/stdc++.h>
using namespace std;
int main() {
    int l, m;
    cin >> l >> m;
    vector<bool> removed(l + 1, false);
    for (int i = 0; i < m; i++) {
        int a, b;
        cin >> a >> b;
        if (a > b) swap(a, b);
        for (int j = a; j <= b; j++) removed[j] = true;
    }
    int kept = 0;
    for (int j = 0; j <= l; j++) if (!removed[j]) kept++;
    cout << kept << '\n';
    return 0;
}
