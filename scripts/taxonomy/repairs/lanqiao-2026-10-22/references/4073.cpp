#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    string s = "A";
    for (int k = 1; k < n; k++) {
        string t;
        t.reserve(s.size() * 2 + 1);
        t = s;
        t.push_back(char('A' + k));
        t += s;
        s.swap(t);
    }
    cout << s << "\n";
    return 0;
}
