#include <bits/stdc++.h>
using namespace std;
int N;
int val(char c) { return c <= '9' ? c - '0' : c - 'A' + 10; }
char chr(int v) { return v <= 9 ? char('0' + v) : char('A' + v - 10); }
string addrev(const string &s) {
    string t(s.rbegin(), s.rend());
    string r;
    int carry = 0;
    for (size_t i = 0; i < s.size(); i++) {
        int v = val(s[i]) + val(t[i]) + carry;
        r += chr(v % N);
        carry = v / N;
    }
    while (carry) { r += chr(carry % N); carry /= N; }
    return string(r.rbegin(), r.rend());
}
bool pal(const string &s) {
    for (size_t i = 0, j = s.size() - 1; i < j; i++, j--)
        if (s[i] != s[j]) return false;
    return true;
}
int main() {
    string M;
    cin >> N >> M;
    for (int step = 0; step <= 30; step++) {
        if (pal(M)) { cout << "STEP=" << step << endl; return 0; }
        if (step < 30) M = addrev(M);
    }
    cout << "Impossible!" << endl;
    return 0;
}
