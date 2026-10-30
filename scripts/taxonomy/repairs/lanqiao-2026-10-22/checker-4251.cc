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
    if (token.size() > 256 || !decimalToken(token)) quitf(verdict, "expected a finite decimal number");
    char *end = nullptr;
    long double result = strtold(token.c_str(), &end);
    if (!isfinite(result) || end != token.c_str() + token.size()) quitf(verdict, "expected a finite decimal number");
    return result;
}
void check(InStream &stream, const vector<long double> &expected, TResult verdict) {
    long double last = -numeric_limits<long double>::infinity();
    for (long double want : expected) {
        long double got = number(stream, verdict);
        if (got <= last) quitf(verdict, "roots must be strictly increasing");
        if (fabsl(got - want) > 0.005000000001L) quitf(verdict, "root absolute error exceeds 0.005");
        last = got;
    }
    if (!stream.seekEof()) quitf(verdict, "extra output");
}
int main(int argc, char *argv[]) {
    registerTestlibCmd(argc, argv);
    long double a = number(inf, _fail), b = number(inf, _fail);
    long double c = number(inf, _fail), d = number(inf, _fail);
    if (a == 0 || max({fabsl(a), fabsl(b), fabsl(c), fabsl(d)}) > 10 || !inf.seekEof())
        quitf(_fail, "invalid cubic coefficients");
    // Independently use the trigonometric form of a depressed cubic.
    b /= a; c /= a; d /= a;
    long double p = c - b * b / 3;
    long double q = 2 * b * b * b / 27 - b * c / 3 + d;
    if (p >= 0) quitf(_fail, "cubic has fewer than three distinct real roots");
    long double radius = 2 * sqrtl(-p / 3);
    long double z = -q / (2 * sqrtl(-(p * p * p) / 27));
    if (z <= -1 || z >= 1) quitf(_fail, "cubic has fewer than three distinct real roots");
    long double theta = acosl(z) / 3, pi = acosl(-1.0L);
    vector<long double> roots;
    for (int i = 0; i < 3; ++i) roots.push_back(radius * cosl(theta - 2 * pi * i / 3) - b / 3);
    sort(roots.begin(), roots.end());
    if (roots.front() < -100.000000001L || roots.back() > 100.000000001L
        || roots[1] - roots[0] < 0.999999999L || roots[2] - roots[1] < 0.999999999L)
        quitf(_fail, "input roots are out of range or too close");
    check(ans, roots, _fail);
    check(ouf, roots, _wa);
    quitf(_ok, "three increasing roots have absolute error at most 0.005");
}
