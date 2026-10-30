#include <bits/stdc++.h>
using namespace std;
int n, best = 0;
vector<string> w;
int available[25], maxGain[25], ovl[25][25];
unsigned long long radix[25];
bool reachable[25][25];
unordered_map<unsigned long long, int> memo;
int overlap(const string &a, const string &b) {
    int lim = min(a.size(), b.size()) - 1;
    for (int l = 1; l <= lim; l++) {
        bool ok = true;
        for (int i = 0; i < l; i++) if (a[a.size()-l+i] != b[i]) { ok = false; break; }
        if (ok) return l;
    }
    return 0;
}
void dfs(int len, int last, unsigned long long state) {
    best = max(best, len);
    int upper = len;
    for (int j = 0; j < n; ++j) if (reachable[last][j]) upper += available[j] * maxGain[j];
    if (upper <= best) return;
    unsigned long long key = state * n + last;
    auto found = memo.find(key);
    if (found != memo.end() && found->second >= len) return;
    memo[key] = len;
    for (int j = 0; j < n; j++)
        if (available[j] && ovl[last][j] > 0) {
            available[j]--;
            dfs(len + (int)w[j].size() - ovl[last][j], j, state - radix[j]);
            available[j]++;
        }
}
int main() {
    int count; cin >> count;
    map<string, int> frequencies;
    for (int i = 0; i < count; ++i) { string s; cin >> s; frequencies[s] += 2; }
    for (const auto &entry : frequencies) { available[w.size()] = entry.second; w.push_back(entry.first); }
    n = w.size();
    char st; cin >> st;
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) {
        ovl[i][j] = overlap(w[i], w[j]);
        reachable[i][j] = ovl[i][j] > 0;
        if (ovl[i][j]) maxGain[j] = max(maxGain[j], (int)w[j].size() - ovl[i][j]);
    }
    for (int k = 0; k < n; ++k) for (int i = 0; i < n; ++i) for (int j = 0; j < n; ++j)
        reachable[i][j] = reachable[i][j] || (reachable[i][k] && reachable[k][j]);
    unsigned long long state = 0, product = 1;
    for (int i = 0; i < n; ++i) { radix[i] = product; state += available[i] * product; product *= available[i] + 1; }
    for (int i = 0; i < n; i++)
        if (w[i][0] == st) {
            available[i]--;
            dfs(w[i].size(), i, state - radix[i]);
            available[i]++;
        }
    cout << best << endl;
    return 0;
}
