#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;
struct Car { long long value; int people, left, right; };

long long readChoice(InStream &stream, const vector<Car> &cars, TResult verdict) {
    int n = (int)cars.size() - 1;
    int k = stream.readInt(0, n, "number of cars");
    vector<int> ids;
    int previous = 0;
    long long passengers = 0, value = 0;
    for (int i = 0; i < k; ++i) {
        int id = stream.readInt(1, n, "car id");
        if (id <= previous) quitf(verdict, "car ids must be strictly increasing");
        ids.push_back(id); previous = id;
        passengers += cars[id].people; value += cars[id].value;
    }
    long long prefix = 0;
    for (int id : ids) {
        if (cars[id].left != prefix || cars[id].right != passengers - prefix - cars[id].people)
            quitf(verdict, "car %d has incorrect passenger totals", id);
        prefix += cars[id].people;
    }
    // Older imported answers include a value line. Accept it only when correct.
    if (!stream.seekEof()) {
        long long claimed = stream.readLong();
        if (claimed != value) quitf(verdict, "reported value differs from selected cars");
    }
    if (!stream.seekEof()) quitf(verdict, "extra output after the answer");
    return value;
}

int main(int argc, char *argv[]) {
    registerTestlibCmd(argc, argv);
    int n = inf.readInt(1, 100000, "n");
    vector<Car> cars(n + 1);
    // DP states: (total passengers in the final train, passengers in its prefix).
    unordered_map<long long, long long> best;
    best.reserve(2 * n);
    long long optimum = 0;
    for (int i = 1; i <= n; ++i) {
        auto &c = cars[i];
        c.value = inf.readLong(1LL, 10000LL, "value");
        c.people = inf.readInt(1, 100000, "people");
        c.left = inf.readInt(0, 100000, "left");
        c.right = inf.readInt(0, 100000, "right");
        long long total = c.people + c.left + c.right, prefixValue = 0;
        if (c.left) {
            auto it = best.find(total * 300001 + c.left);
            if (it == best.end()) continue;
            prefixValue = it->second;
        }
        long long key = total * 300001 + c.left + c.people;
        best[key] = max(best[key], prefixValue + c.value);
        if (!c.right) optimum = max(optimum, prefixValue + c.value);
    }
    if (!inf.seekEof()) quitf(_fail, "unexpected input data");
    long long juryValue = readChoice(ans, cars, _fail);
    if (juryValue != optimum) quitf(_fail, "jury answer is not optimal");
    long long userValue = readChoice(ouf, cars, _wa);
    if (userValue != optimum) quitf(_wa, "selected value %lld; optimum %lld", userValue, optimum);
    quitf(_ok, "optimal legal subsequence, value %lld", optimum);
}
