#include <bits/stdc++.h>
using namespace std;
int main() {
    string a, b;
    cin >> a >> b;
    string c;
    int i = a.size() - 1, j = b.size() - 1, carry = 0;
    while (i >= 0 || j >= 0 || carry) {
        int s = carry;
        if (i >= 0) s += a[i--] - '0';
        if (j >= 0) s += b[j--] - '0';
        c.push_back(s % 10 + '0');
        carry = s / 10;
    }
    reverse(c.begin(), c.end());
    cout << c << endl;
    return 0;
}
