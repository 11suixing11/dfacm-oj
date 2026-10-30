#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;

int main(int argc, char* argv[]) {
    registerTestlibCmd(argc, argv);
    int n = inf.readInt(2, 300000, "n");
    vector<long long> a(n);
    for (auto& x : a) x = inf.readLong(-1000000000LL, 1000000000LL, "beauty");
    if (!inf.seekEof()) quitf(_fail, "unexpected input tokens");

    // The first and last occurrences of each beauty maximize the positive
    // interior sum. Negative interior trees can always be removed.
    map<long long, pair<int, int>> endpoints;
    vector<long long> positive(n + 1);
    for (int i = 0; i < n; ++i) {
        positive[i + 1] = positive[i] + max(0LL, a[i]);
        auto [it, added] = endpoints.emplace(a[i], make_pair(i, i));
        it->second.second = i;
    }
    long long optimum = LLONG_MIN;
    for (const auto& [value, span] : endpoints) {
        auto [l, r] = span;
        if (l < r) optimum = max(optimum, 2 * value + positive[r] - positive[l + 1]);
    }
    if (optimum == LLONG_MIN) quitf(_fail, "no equal endpoint pair");

    long long claimed = ouf.readLong();
    int k = ouf.readInt(0, n - 2, "number of removed trees");
    vector<bool> removed(n);
    for (int i = 0; i < k; ++i) {
        int id = ouf.readInt(1, n, "removed tree") - 1;
        if (removed[id]) quitf(_wa, "tree %d removed twice", id + 1);
        removed[id] = true;
    }
    if (!ouf.seekEof()) quitf(_wa, "extra output");
    int first = -1, last = -1;
    long long sum = 0;
    for (int i = 0; i < n; ++i) if (!removed[i]) {
        if (first == -1) first = i;
        last = i;
        sum += a[i];
    }
    if (first == last) quitf(_wa, "at least two trees must remain");
    if (a[first] != a[last]) quitf(_wa, "remaining endpoint beauties differ");
    if (claimed != sum) quitf(_wa, "claimed sum differs from remaining sum");
    if (sum != optimum) quitf(_wa, "sum %lld, optimum %lld", sum, optimum);
    quitf(_ok, "optimal remaining sum %lld", sum);
}
