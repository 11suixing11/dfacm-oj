#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;

int main(int argc, char* argv[]) {
    registerTestlibCmd(argc, argv);
    string original = inf.readToken("[a-z]{1,1000}", "s");
    int n = original.size();
    vector<int> prime(n + 1, true), constrained;
    for (int p = 2; p <= n; p++) if (prime[p]) {
        for (int v = p * 2; v <= n; v += p) prime[v] = false;
    }
    vector<int> parent(n + 1), size(n + 1, 1);
    iota(parent.begin(), parent.end(), 0);
    function<int(int)> find = [&](int x) { return parent[x] == x ? x : parent[x] = find(parent[x]); };
    for (int p = 2; p <= n; p++) if (prime[p]) {
        for (int v = p * 2; v <= n; v += p) {
            int a = find(p), b = find(v);
            if (a != b) { parent[b] = a; size[a] += size[b]; }
        }
    }
    array<int, 26> frequencies{};
    for (char c : original) frequencies[c - 'a']++;
    // All nontrivial prime-multiple components coalesce for n >= 6;
    // for n < 6 there is at most one nontrivial component.
    int largest = 1;
    for (int i = 1; i <= n; i++) if (find(i) == i) largest = max(largest, size[i]);
    bool possible = *max_element(frequencies.begin(), frequencies.end()) >= largest;
    string verdict = ouf.readToken();
    if (verdict == "NO") {
        if (possible) quitf(_wa, "a valid prime permutation exists");
        if (!ouf.seekEof()) quitf(_wa, "unexpected output after NO");
        quitf(_ok, "correctly reports no valid permutation");
    }
    if (verdict != "YES") quitf(_wa, "expected YES or NO");
    string candidate = ouf.readToken();
    if ((int)candidate.size() != n) quitf(_wa, "permutation has the wrong length");
    string a = original, b = candidate;
    sort(a.begin(), a.end()); sort(b.begin(), b.end());
    if (a != b) quitf(_wa, "output must preserve the original character multiset");
    for (int p = 2; p <= n; p++) if (prime[p]) {
        for (int v = p * 2; v <= n; v += p) {
            if (candidate[p - 1] != candidate[v - 1]) quitf(_wa, "positions %d and %d violate the prime condition", p, v);
        }
    }
    if (!ouf.seekEof()) quitf(_wa, "unexpected output after the permutation");
    quitf(_ok, "valid prime permutation accepted");
}
