#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> values(n);
    for (int i = 0; i < n; i++) cin >> values[i];
    sort(values.begin(), values.end());
    values.erase(unique(values.begin(), values.end()), values.end());
    cout << values.size() << '\n';
    for (size_t i = 0; i < values.size(); i++) {
        if (i) cout << ' ';
        cout << values[i];
    }
    cout << '\n';
    return 0;
}
