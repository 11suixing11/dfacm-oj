#include "testlib.h"
#include <bits/stdc++.h>
using namespace std;

bool decimalToken(const string &token) {
    size_t p = 0, digits = 0;
    if (p < token.size() && (token[p] == '+' || token[p] == '-')) ++p;
    while (p < token.size() && token[p] >= '0' && token[p] <= '9') ++p, ++digits;
    if (p < token.size() && token[p] == '.') {
        ++p;
        while (p < token.size() && token[p] >= '0' && token[p] <= '9') ++p, ++digits;
    }
    if (!digits) return false;
    if (p < token.size() && (token[p] == 'e' || token[p] == 'E')) {
        ++p;
        if (p < token.size() && (token[p] == '+' || token[p] == '-')) ++p;
        size_t start = p;
        while (p < token.size() && token[p] >= '0' && token[p] <= '9') ++p;
        if (p == start) return false;
    }
    return p == token.size();
}

long double number(InStream &stream, TResult verdict) {
    string token = stream.readToken();
    if (token.size() > 256) quitf(verdict, "numeric token is too long");
    if (!decimalToken(token)) quitf(verdict, "expected a finite decimal number");
    char *end = nullptr;
    long double result = strtold(token.c_str(), &end);
    if (!isfinite(result) || end != token.c_str() + token.size())
        quitf(verdict, "expected a finite decimal number");
    if (!stream.seekEof()) quitf(verdict, "extra output");
    return result;
}
int main(int argc, char *argv[]) {
    registerTestlibCmd(argc, argv);
    int n = inf.readInt(1, 100000, "n");
    vector<vector<int>> adjacent(n);
    for (int i = 1; i < n; ++i) {
        int u = inf.readInt(1, n, "u") - 1, v = inf.readInt(1, n, "v") - 1;
        if (u == v) quitf(_fail, "self-loop in input");
        adjacent[u].push_back(v); adjacent[v].push_back(u);
    }
    vector<long long> x(n), y(n), sumX(n);
    long long totalX = 0, totalY = 0;
    for (int i = 0; i < n; ++i) {
        x[i] = inf.readInt(0, 1000000, "x");
        y[i] = inf.readInt(0, 1000000, "y");
        totalX += x[i]; totalY += y[i]; sumX[i] = x[i];
    }
    if (totalX < 1 || totalX > 1000000 || totalY < 1 || totalY > 1000000 || !inf.seekEof())
        quitf(_fail, "invalid entrance/exit weights");
    vector<int> parent(n, -1), order{0}, size(n, 1); parent[0] = 0;
    for (size_t i = 0; i < order.size(); ++i) {
        int u = order[i];
        for (int v : adjacent[u]) {
            if (v == parent[u]) continue;
            if (parent[v] >= 0) quitf(_fail, "input is not a tree");
            parent[v] = u; order.push_back(v);
        }
    }
    if ((int)order.size() != n) quitf(_fail, "disconnected input");
    for (int i = n - 1; i > 0; --i) {
        int u = order[i], p = parent[u];
        size[p] += size[u]; sumX[p] += sumX[u];
    }
    __int128 numerator = 0;
    for (int i = 1; i < n; ++i) {
        int u = order[i], p = parent[u];
        numerator += (__int128)size[u] * sumX[u] * y[p];
        numerator += (__int128)(n - size[u]) * (totalX - sumX[u]) * y[u];
    }
    long double expected = (long double)numerator / ((long double)totalX * totalY);
    if (fabsl(number(ans, _fail) - expected) > 1e-9L)
        quitf(_fail, "jury value exceeds the required absolute error");
    long double got = number(ouf, _wa);
    if (fabsl(got - expected) > 1e-9L)
        quitf(_wa, "absolute error exceeds 1e-9");
    quitf(_ok, "absolute error is within 1e-9");
}
