#include <bits/stdc++.h>
using namespace std;
int main() {
    int r, c;
    cin >> r >> c;
    vector<vector<int>> grid(r, vector<int>(c));
    for (int i = 0; i < r; i++)
        for (int j = 0; j < c; j++) cin >> grid[i][j];
    long long best = 0;
    for (int color = 0; color <= 1; color++) {
        vector<vector<int>> side(r, vector<int>(c, 0));
        for (int i = 0; i < r; i++)
            for (int j = 0; j < c; j++) {
                if (grid[i][j] != color) continue;
                if (i == 0 || j == 0) side[i][j] = 1;
                else side[i][j] = min(min(side[i - 1][j], side[i][j - 1]), side[i - 1][j - 1]) + 1;
                best = max(best, (long long)side[i][j] * side[i][j]);
            }
    }
    cout << best << '\n';
    return 0;
}
