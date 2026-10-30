#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<long long> h;
    long long x;
    while (cin >> x) h.push_back(x);
    int n = h.size();
    vector<long long> decreasing, increasing;
    for (long long height : h) {
        // Equal heights extend an interception sequence, but not a strict LIS.
        long long negative = -height;
        auto a = upper_bound(decreasing.begin(), decreasing.end(), negative);
        if (a == decreasing.end()) decreasing.push_back(negative);
        else *a = negative;
        auto b = lower_bound(increasing.begin(), increasing.end(), height);
        if (b == increasing.end()) increasing.push_back(height);
        else *b = height;
    }
    cout << decreasing.size() << "\n" << increasing.size() << endl;
    return 0;
}
