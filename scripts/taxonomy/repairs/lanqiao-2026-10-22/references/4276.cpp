#include <bits/stdc++.h>
using namespace std;
int main() {
    string digits;
    cin >> digits;
    for (size_t i = 0; i < digits.size(); i++) {
        if (i) cout << ' ';
        cout << digits[i];
    }
    cout << '\n';
    return 0;
}
