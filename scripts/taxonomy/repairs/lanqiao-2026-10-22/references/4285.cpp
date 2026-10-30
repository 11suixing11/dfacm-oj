#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    unordered_map<string, char> byName, byNumber;
    for (int i = 0; i < n; i++) {
        string name, number;
        char sex;
        cin >> name >> number >> sex;
        byName[name] = sex;
        byNumber[number] = sex;
    }
    int m;
    cin >> m;
    for (int i = 0; i < m; i++) {
        string a, b;
        cin >> a >> b;
        char x = byName.count(a) ? byName[a] : byNumber[a];
        char y = byName.count(b) ? byName[b] : byNumber[b];
        cout << (x != y ? 'Y' : 'N') << '\n';
    }
    return 0;
}
