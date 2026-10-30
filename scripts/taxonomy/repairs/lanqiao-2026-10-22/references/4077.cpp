#include <bits/stdc++.h>
using namespace std;
int main() {
    string a, b;
    cin >> a >> b;
    if (a.size() != b.size()) { cout << 1 << endl; return 0; }
    bool same = true, ci = true;
    for (size_t i = 0; i < a.size(); i++) {
        if (a[i] != b[i]) same = false;
        if (tolower(a[i]) != tolower(b[i])) ci = false;
    }
    cout << (same ? 2 : ci ? 3 : 4) << endl;
    return 0;
}
