#include <bits/stdc++.h>
using namespace std;
struct Meeting { int left, right, id; };
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n; cin >> n;
    vector<Meeting> input(n), sorted;
    for (int i = 0; i < n; ++i) {
        cin >> input[i].left >> input[i].right;
        input[i].id = i + 1;
    }
    sorted = input;
    sort(sorted.begin(), sorted.end(), [](auto a, auto b) {
        return tie(a.left, a.right, a.id) < tie(b.left, b.right, b.id);
    });
    vector<int> starts(n), suffix(n + 1, n);
    for (int i = 0; i < n; ++i) starts[i] = sorted[i].left;
    for (int i = n - 1; i >= 0; --i) {
        int other = suffix[i + 1];
        suffix[i] = other == n || sorted[i].right < sorted[other].right ? i : other;
    }
    int log = 1;
    while ((1 << log) <= n) ++log;
    vector<vector<int>> jump(log, vector<int>(n + 1, n));
    for (int i = 0; i < n; ++i) {
        int at = upper_bound(starts.begin(), starts.end(), sorted[i].right) - starts.begin();
        jump[0][i] = suffix[at];
    }
    for (int k = 1; k < log; ++k)
        for (int i = 0; i < n; ++i) jump[k][i] = jump[k - 1][jump[k - 1][i]];
    // Maximum number of meetings strictly between the two occupied boundaries.
    auto capacity = [&](int left, int right) {
        int at = upper_bound(starts.begin(), starts.end(), left) - starts.begin();
        int cur = suffix[at];
        if (cur == n || sorted[cur].right >= right) return 0;
        int count = 1;
        for (int k = log - 1; k >= 0; --k) {
            int next = jump[k][cur];
            if (next < n && sorted[next].right < right) count += 1 << k, cur = next;
        }
        return count;
    };
    int optimum = capacity(0, 1000000001);
    map<int, int> chosen;
    vector<int> ids;
    for (const Meeting &cur : input) {
        auto after = chosen.lower_bound(cur.left);
        int right = after == chosen.end() ? 1000000001 : after->first;
        int left = after == chosen.begin() ? 0 : input[prev(after)->second - 1].right;
        if (cur.left <= left || cur.right >= right) continue;
        if (capacity(left, cur.left) + 1 + capacity(cur.right, right) == capacity(left, right)) {
            chosen[cur.left] = cur.id;
            ids.push_back(cur.id);
        }
    }
    cout << optimum << '\n';
    for (int i = 0; i < (int)ids.size(); ++i) cout << ids[i] << (i + 1 == (int)ids.size() ? '\n' : ' ');
}
