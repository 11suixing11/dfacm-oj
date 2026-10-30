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

long double decimal(InStream &stream, TResult verdict) {
    string token = stream.readToken();
    if (token.size() > 256 || !decimalToken(token)) quitf(verdict, "expected finite decimal number");
    char *end = nullptr; long double value = strtold(token.c_str(), &end);
    if (!isfinite(value) || end != token.c_str() + token.size()) quitf(verdict, "expected finite decimal number");
    return value;
}
int main(int argc, char *argv[]) {
    registerTestlibCmd(argc, argv);
    int n = inf.readInt(0, 99, "n");
    long double expected = 0;
    for (int i = 0; i < n; ++i) {
        string name = inf.readToken();
        if (name.size() > 100) quitf(_fail, "invalid product name");
        long double price = decimal(inf, _fail);
        int quantity = inf.readInt(); expected += price * quantity;
    }
    if (!inf.seekEof() || !isfinite(expected)) quitf(_fail, "invalid input");
    long double jury = decimal(ans, _fail);
    if (!ans.seekEof() || fabsl(jury - expected) > 1e-6L) quitf(_fail, "incorrect jury amount");
    long double user = decimal(ouf, _wa);
    if (!ouf.seekEof()) quitf(_wa, "extra output");
    if (fabsl(user - expected) > 1e-6L) quitf(_wa, "absolute error exceeds 1e-6");
    quitf(_ok, "correct total amount");
}
