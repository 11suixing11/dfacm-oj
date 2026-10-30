#include <bits/stdc++.h>
using namespace std;

// A color change joins whole cell groups. Only symbols need spiral ordering.
struct Group {
    int parent, color, count;
    vector<int> symbols;
};
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n, m; if (!(cin >> n >> m)) return 0;
    int cells = n * m;
    vector<Group> groups;
    map<int, int> byColor;
    vector<int> cellGroup(cells), symbol(cells);
    vector<bool> active(cells);
    for (int i = 0; i < cells; ++i) {
        int color; cin >> color;
        if (!byColor.count(color)) {
            int id = groups.size();
            byColor[color] = id;
            groups.push_back({id, color, 0, {}});
        }
        int id = byColor[color]; cellGroup[i] = id; ++groups[id].count;
    }
    for (int i = 0; i < cells; ++i) {
        cin >> symbol[i]; active[i] = symbol[i] >= 0;
        if (active[i]) groups[cellGroup[i]].symbols.push_back(i);
    }
    int x, y; cin >> x >> y; int start = (x - 1) * m + y - 1;
    function<int(int)> find = [&](int u) {
        return groups[u].parent == u ? u : groups[u].parent = find(groups[u].parent);
    };
    auto spiral = [](int dr, int dc) {
        int ring = max(abs(dr), abs(dc));
        if (!ring) return 0;
        int base = (2 * ring - 1) * (2 * ring - 1);
        if (dr == -ring && dc > -ring) return base + dc + ring - 1;
        if (dc == ring) return base + 2 * ring - 1 + dr + ring;
        if (dr == ring) return base + 4 * ring - 1 + ring - dc;
        return base + 6 * ring - 1 + ring - dr;
    };
    queue<int> pending; pending.push(start); active[start] = false;
    long long answer = 0;
    while (!pending.empty()) {
        int pos = pending.front(); pending.pop();
        int root = find(cellGroup[pos]), before = groups[root].color, after = symbol[pos];
        if (before == 0 || before == after) continue;
        answer += groups[root].count;
        vector<pair<int, int>> touched;
        for (int other : groups[root].symbols) if (active[other]) {
            touched.push_back({spiral(other / m - pos / m, other % m - pos % m), other});
        }
        groups[root].symbols.clear();
        sort(touched.begin(), touched.end());
        for (auto [rank, other] : touched) {
            active[other] = false; pending.push(other);
        }
        byColor.erase(before);
        auto existing = byColor.find(after);
        if (existing == byColor.end()) {
            groups[root].color = after; byColor[after] = root;
        } else {
            int destination = find(existing->second);
            // Symbols of the source have all left the board; retain destination symbols.
            vector<int> remaining = move(groups[destination].symbols);
            if (groups[root].count < groups[destination].count) swap(root, destination);
            groups[destination].parent = root;
            groups[root].count += groups[destination].count;
            groups[root].color = after;
            groups[root].symbols = move(remaining);
            byColor[after] = root;
        }
    }
    cout << answer << '\n';
}
