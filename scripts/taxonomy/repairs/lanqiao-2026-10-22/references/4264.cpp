#include <bits/stdc++.h>
using namespace std;
int main() {
    int p1, p2, p3;
    string s;
    cin >> p1 >> p2 >> p3 >> s;
    string out;
    for (size_t i = 0; i < s.size(); i++) {
        if (s[i] == '-' && i > 0 && i + 1 < s.size()) {
            char a = s[i-1], b = s[i+1];
            bool both = (isdigit(a) && isdigit(b)) || (islower(a) && islower(b));
            if (both && b > a) {
                if (a + 1 == b) continue;
                string fill;
                for (char c = a + 1; c < b; c++) {
                    char ch = c;
                    if (p1 == 3) ch = '*';
                    else if (p1 == 2 && islower(ch)) ch = toupper(ch);
                    for (int k = 0; k < p2; k++) fill += ch;
                }
                if (p3 == 2) reverse(fill.begin(), fill.end());
                out += fill;
                continue;
            }
        }
        out += s[i];
    }
    cout << out << endl;
    return 0;
}
