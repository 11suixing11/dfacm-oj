#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n; string e;
    cin >> n >> e;
    vector<pair<long long,int>> terms;
    int i = 0, len = e.size(), sign = 1;
    if (len && e[0] == '-') { sign = -1; i = 1; }
    while (i < len) {
        long long coef = 1;
        int kind = 1;
        if (isdigit(e[i])) {
            coef = 0;
            while (i < len && isdigit(e[i])) coef = coef * 10 + (e[i++] - '0');
            if (i < len && e[i] == '*') i++;
        }
        if (i + 1 < len && e[i] == '+' && e[i+1] == '+') { kind = 2; i += 2; }
        if (i < len && e[i] == 'a') i++;
        if (kind != 2 && i + 1 < len && e[i] == '+' && e[i+1] == '+') i += 2;
        terms.push_back({sign * coef, kind});
        if (i < len && (e[i] == '+' || e[i] == '-')) { sign = (e[i] == '+') ? 1 : -1; i++; }
    }
    sort(terms.begin(), terms.end());
    long long total = 0;
    for (size_t p = 0; p < terms.size(); p++)
        total += terms[p].first * (n + (long long)p + (terms[p].second == 2 ? 1 : 0));
    cout << total << endl;
    return 0;
}
