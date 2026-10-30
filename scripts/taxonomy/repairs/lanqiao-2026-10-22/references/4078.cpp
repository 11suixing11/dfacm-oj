#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; string s;
    cin >> n >> s;
    int cnt[26] = {0};
    for (char c : s) cnt[c - 'a']++;
    int odd = 0;
    for (int i = 0; i < 26; i++) if (cnt[i] % 2) odd++;
    if (odd > 1) { cout << "Impossible" << endl; return 0; }
    vector<char> v(s.begin(), s.end());
    long long swaps = 0;
    int L = 0, R = n - 1;
    while (L < R) {
        int k = R;
        while (v[k] != v[L]) k--;
        if (k == L) { swap(v[L], v[L + 1]); swaps++; continue; }
        for (int m = k; m < R; m++) { swap(v[m], v[m + 1]); swaps++; }
        L++; R--;
    }
    cout << swaps << endl;
    return 0;
}
