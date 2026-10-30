#include <bits/stdc++.h>
using namespace std;
int n, kx, ky;
long long total;
bool columns[13], rising[25], falling[25];
void dfs(int row) {
    if (row == n) { total++; return; }
    for (int c = 0; c < n; c++) {
        if (columns[c] || rising[row + c] || falling[row - c + n]) continue;
        if (abs(row - kx) <= 1 && abs(c - ky) <= 1) continue;
        columns[c] = rising[row + c] = falling[row - c + n] = true;
        dfs(row + 1);
        columns[c] = rising[row + c] = falling[row - c + n] = false;
    }
}
int main() {
    cin >> n >> kx >> ky;
    kx--; ky--;
    dfs(0);
    cout << total << '\n';
    return 0;
}
