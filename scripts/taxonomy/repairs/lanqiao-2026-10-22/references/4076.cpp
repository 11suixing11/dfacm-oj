#include <bits/stdc++.h>
using namespace std;
int main() {
    int m, n;
    cin >> m >> n;
    vector<vector<int>> a(m, vector<int>(n));
    for (auto &r : a) for (auto &x : r) cin >> x;
    vector<vector<bool>> vis(m, vector<bool>(n));
    int dx[] = {1, 0, -1, 0}, dy[] = {0, 1, 0, -1};
    int x = 0, y = 0, d = 0, total = m * n;
    for (int i = 0; i < total; i++) {
        cout << a[x][y] << (i + 1 == total ? "\n" : " ");
        vis[x][y] = true;
        int nx = x + dx[d], ny = y + dy[d];
        if (nx < 0 || nx >= m || ny < 0 || ny >= n || vis[nx][ny]) {
            d = (d + 1) % 4;
            nx = x + dx[d]; ny = y + dy[d];
        }
        x = nx; y = ny;
    }
    return 0;
}
