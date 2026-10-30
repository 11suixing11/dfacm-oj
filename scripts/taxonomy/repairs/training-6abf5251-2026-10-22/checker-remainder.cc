#include "testlib.h"
#include <cmath>

int main(int argc, char** argv) {
    registerTestlibCmd(argc, argv);
    long double a = inf.readDouble();
    long double b = inf.readDouble();
    if (!(b > 0)) quitf(_fail, "The divisor must be positive");
    long double expected = fmodl(a, b);
    if (expected < 0) expected += b;
    auto close = [&](long double value) {
        return std::isfinite(value) && fabsl(value - expected) <= 5e-6L * fmaxl(1, fabsl(expected));
    };
    double stored = ans.readDouble();
    if (!close(stored)) quitf(_fail, "The stored answer does not match the input");
    double submitted = ouf.readDouble();
    if (!close(submitted)) quitf(_wa, "The floating-point remainder is incorrect");
    if (!ouf.seekEof()) quitf(_wa, "Unexpected trailing output");
    quitf(_ok, "Correct floating-point remainder");
}
