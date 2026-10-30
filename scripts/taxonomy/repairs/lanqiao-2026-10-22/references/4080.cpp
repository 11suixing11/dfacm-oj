#include <bits/stdc++.h>
using namespace std;
string dg[] = {"ling","yi","er","san","si","wu","liu","qi","ba","jiu"};
string pos[] = {"", "shi", "bai", "qian"};
vector<string> read4(int x) { // 1 <= x <= 9999
    vector<string> r;
    int p10[4] = {1, 10, 100, 1000};
    bool lastZero = false;
    for (int i = 3; i >= 0; i--) {
        int digit = x / p10[i] % 10;
        if (digit) {
            r.push_back(dg[digit]);
            if (i) r.push_back(pos[i]);
            lastZero = false;
        } else if (!r.empty() && !lastZero && i != 0 && x % p10[i] > 0) {
            r.push_back("ling");
            lastZero = true;
        }
    }
    return r;
}
int main() {
    string line;
    getline(cin, line);
    string digits;
    for (char c : line) if (isdigit((unsigned char)c)) digits += c;
    long long n = stoll(digits);
    if (n == 0) { cout << "ling" << endl; return 0; }
    vector<string> out;
    int part[3];
    part[2] = n / 100000000;
    part[1] = n / 10000 % 10000;
    part[0] = n % 10000;
    const char *unit[] = {"", "wan", "yi"};
    bool hasPrev = false, skipped = false;
    for (int i = 2; i >= 0; i--) {
        if (part[i] == 0) {
            if (hasPrev) skipped = true;
            continue;
        }
        vector<string> g = read4(part[i]);
        if (hasPrev && (skipped || part[i] < 1000)) out.push_back("ling");
        for (string &s : g) out.push_back(s);
        if (i) out.push_back(unit[i]);
        hasPrev = true;
        skipped = false;
    }
    string s;
    for (size_t i = 0; i < out.size(); i++) s += (i ? " " : "") + out[i];
    if (s.rfind("yi shi", 0) == 0) s = s.substr(3);
    cout << s << endl;
    return 0;
}
