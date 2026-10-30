#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string s;
    getline(cin, s);
    if (!s.empty() && s.back() == '\r') s.pop_back();
    char op, a, b = 0;
    cin >> op >> a;
    if (op != 'D') cin >> b;
    size_t pos = op == 'I' ? s.rfind(a) : s.find(a);
    if (pos == string::npos) {
        cout << "IS NOT FOUND\n";
        return 0;
    }
    if (op == 'D') s.erase(pos, 1);
    if (op == 'I') s.insert(pos, 1, b);
    if (op == 'R') replace(s.begin(), s.end(), a, b);
    cout << s << '\n';
}
