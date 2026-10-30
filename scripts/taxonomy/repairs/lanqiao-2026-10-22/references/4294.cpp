#include <bits/stdc++.h>
using namespace std;
vector<vector<pair<int, int>>> days;
void generate(int size, int base) {
    if (size == 1) return;
    int half = size / 2;
    generate(half, base);
    generate(half, base + half);
    for (int rotation = 0; rotation < half; rotation++)
        for (int index = 0; index < half; index++)
            days[half - 1 + rotation].push_back({base + index, base + half + (index ^ rotation)});
}
int main() {
    int n;
    cin >> n;
    int total = 1 << n;
    days.assign(total - 1, {});
    generate(total, 0);
    for (int d = 0; d < total - 1; d++) {
        cout << '<' << d + 1 << '>';
        for (auto &match : days[d]) cout << match.first + 1 << '-' << match.second + 1 << ' ';
        cout << '\n';
    }
    return 0;
}
