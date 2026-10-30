#include <bits/stdc++.h>
using namespace std;
typedef string Big;
Big trim(const Big &s) { size_t i = s.find_first_not_of('0'); return i == string::npos ? "0" : s.substr(i); }
Big val(const string &s, int l, int r) { return trim(s.substr(l, r - l + 1)); }
Big mul(const Big &a, const Big &b) {
    if (a == "0" || b == "0") return "0";
    vector<int> v(a.size() + b.size(), 0);
    for (int i = a.size() - 1; i >= 0; i--)
        for (int j = b.size() - 1; j >= 0; j--)
            v[i + j + 1] += (a[i] - '0') * (b[j] - '0');
    for (int i = v.size() - 1; i > 0; i--) { v[i-1] += v[i] / 10; v[i] %= 10; }
    string r;
    for (int x : v) r += char('0' + x);
    return trim(r);
}
bool lessBig(const Big &a, const Big &b) {
    if (a.size() != b.size()) return a.size() < b.size();
    return a < b;
}
int main() {
    int n, k;
    string s;
    cin >> n >> k >> s;
    vector<vector<Big>> dp(n + 2, vector<Big>(k + 1, "0"));
    for (int i = 0; i < n; i++) dp[i][0] = val(s, i, n - 1);
    for (int j = 1; j <= k; j++)
        for (int i = n - 1 - j; i >= 0; i--) {
            Big best = "0";
            for (int c2 = i; c2 + j < n; c2++) {
                Big cur = mul(val(s, i, c2), dp[c2 + 1][j - 1]);
                if (lessBig(best, cur)) best = cur;
            }
            dp[i][j] = best;
        }
    cout << dp[0][k] << endl;
    return 0;
}
