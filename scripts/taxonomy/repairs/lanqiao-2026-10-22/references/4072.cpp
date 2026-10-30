#include <bits/stdc++.h>
using namespace std;
int n, g[10][10], b[10], w[10];
long long ans;
bool ok(int *col, int r, int c) {
    for (int i = 0; i < r; i++) if (col[i] == c || abs(col[i] - c) == r - i) return false;
    return true;
}
void dfs(int r) {
    if (r == n) { ans++; return; }
    for (int bc = 0; bc < n; bc++) {
        if (!g[r][bc] || !ok(b, r, bc)) continue;
        b[r] = bc;
        for (int wc = 0; wc < n; wc++) {
            if (wc == bc || !g[r][wc] || !ok(w, r, wc)) continue;
            w[r] = wc;
            dfs(r + 1);
        }
    }
}
int main() {
    cin >> n;
    for (int i = 0; i < n; i++) for (int j = 0; j < n; j++) cin >> g[i][j];
    dfs(0);
    cout << ans << endl;
    return 0;
}
