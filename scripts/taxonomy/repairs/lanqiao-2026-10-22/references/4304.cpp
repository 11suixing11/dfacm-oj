#include <bits/stdc++.h>
using namespace std;
int main() {
    string s;
    cin >> s;
    for (size_t i = 0; i < s.size(); i++)
        if (s[i] == 'a' || s[i] == 'e' || s[i] == 'i' || s[i] == 'o' || s[i] == 'u') {
            cout << i + 1 << '\n';
            return 0;
        }
    cout << 0 << '\n';
    return 0;
}
