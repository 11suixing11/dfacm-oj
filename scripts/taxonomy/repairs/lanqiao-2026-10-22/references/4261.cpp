#include <bits/stdc++.h>
using namespace std;
struct Writer {
    static constexpr size_t capacity = 1 << 20;
    char buffer[capacity];
    size_t used = 0;
    void flush() { fwrite(buffer, 1, used, stdout); used = 0; }
    void put(const string &s) {
        if (used + s.size() > capacity) flush();
        memcpy(buffer + used, s.data(), s.size());
        used += s.size();
    }
    ~Writer() { flush(); }
};
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n;
    cin >> n;
    vector<long long> value(n);
    vector<string> token(n);
    for (int i = 0; i < n; ++i) { cin >> value[i]; token[i] = to_string(value[i]); }
    long long target;
    cin >> target;
    vector<long long> sum(1 << n, 0);
    Writer out;
    int count = 0;
    for (int mask = 1; mask < (1 << n); ++mask) {
        int bit = mask & -mask;
        sum[mask] = sum[mask ^ bit] + value[__builtin_ctz((unsigned)bit)];
        if (sum[mask] != target) continue;
        ++count;
        int rest = mask;
        while (rest) {
            bit = rest & -rest;
            out.put(token[__builtin_ctz((unsigned)bit)]);
            rest ^= bit;
            out.put(rest ? " " : "\n");
        }
    }
    out.put(to_string(count));
    out.put("\n");
}
