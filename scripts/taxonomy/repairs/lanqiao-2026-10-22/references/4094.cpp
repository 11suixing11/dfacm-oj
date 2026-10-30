#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    string s = "0";
    for (int i = 0; i < n; i++) {
        string t;
        for (char c : s) t += (c == '0') ? "1" : "01";
        s = t;
    }
    cout << s << endl;
    return 0;
}
