#include "testlib.h"
#include <algorithm>
#include <numeric>
#include <vector>
using namespace std;
using ll = long long;

int main(int argc, char** argv) {
    registerTestlibCmd(argc, argv);
    int n = inf.readInt(1, 999, "n");
    vector<ll> a(n), b(n);
    for (auto& x : a) x = inf.readLong(0, LLONG_MAX, "A");
    for (auto& x : b) x = inf.readLong(0, LLONG_MAX, "B");
    if (!inf.seekEof()) quitf(_fail, "unexpected trailing input");
    vector<int> front, back;
    for (int i = 0; i < n; ++i) (a[i] <= b[i] ? front : back).push_back(i);
    sort(front.begin(), front.end(), [&](int x, int y) { return a[x] < a[y]; });
    sort(back.begin(), back.end(), [&](int x, int y) { return b[x] > b[y]; });
    front.insert(front.end(), back.begin(), back.end());
    auto finish = [&](const vector<int>& order) {
        __int128 first = 0, second = 0;
        for (int i : order) {
            first += a[i];
            second = max(first, second) + b[i];
        }
        return second;
    };
    auto optimum = finish(front);
    if (optimum > LLONG_MAX) quitf(_fail, "optimal time exceeds signed 64-bit range");
    ll claimed = ouf.readLong(0, LLONG_MAX, "time");
    vector<int> order(n);
    vector<bool> used(n);
    for (int& i : order) {
        i = ouf.readInt(1, n, "job") - 1;
        if (used[i]) quitf(_wa, "duplicate job %d", i + 1);
        used[i] = true;
    }
    if (!ouf.seekEof()) quitf(_wa, "unexpected trailing output");
    if (claimed != optimum) quitf(_wa, "time %lld is not optimal (%lld)", claimed, (ll)optimum);
    if (finish(order) != claimed) quitf(_wa, "schedule does not achieve the claimed time");
    quitf(_ok, "optimal permutation independently verified");
}
