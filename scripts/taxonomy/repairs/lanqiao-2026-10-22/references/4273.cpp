#include <bits/stdc++.h>
using namespace std;
int n, mat[12][12];
long long k, memo[1 << 10][11];
long long countWays(int mask, int last) {
    if (mask == (1 << n) - 1) return 1;
    long long &answer = memo[mask][last];
    if (answer != -1) return answer;
    answer = 0;
    for (int v = 0; v < n; ++v)
        if (!(mask >> v & 1) && (last == n || mat[last][v]))
            answer += countWays(mask | (1 << v), v);
    return answer;
}
int main() {
    cin >> n >> k;
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) cin >> mat[i][j];
    memset(memo, -1, sizeof(memo));
    int mask = 0, last = n;
    for (int pos = 0; pos < n; ++pos) {
        for (int v = 0; v < n; ++v) {
            if (mask >> v & 1 || (last != n && !mat[last][v])) continue;
            long long count = countWays(mask | (1 << v), v);
            if (k > count) { k -= count; continue; }
            cout << v << (pos + 1 == n ? '\n' : ' ');
            mask |= 1 << v;
            last = v;
            break;
        }
    }
    return 0;
}
