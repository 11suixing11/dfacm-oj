#include <bits/stdc++.h>
using namespace std;
long double a, b, c, d;
long double f(long double x) { return ((a * x + b) * x + c) * x + d; }
int main() {
    cin >> a >> b >> c >> d;
    // Scaling all coefficients must not change the roots or root detection.
    long double scale = max({fabsl(a), fabsl(b), fabsl(c), fabsl(d)});
    a /= scale; b /= scale; c /= scale; d /= scale;
    long double delta = sqrtl(b * b - 3 * a * c);
    long double p = (-b - delta) / (3 * a), q = (-b + delta) / (3 * a);
    if (p > q) swap(p, q);
    // The derivative's two zeros separate the three distinct real roots.
    // Extending the outside endpoints includes roots exactly at -100 or 100.
    long double cuts[] = {-101, p, q, 101};
    vector<long double> roots;
    for (int j = 0; j < 3; ++j) {
        long double lo = cuts[j], hi = cuts[j + 1], left = f(lo);
        for (int i = 0; i < 150; ++i) {
            long double mid = (lo + hi) / 2, value = f(mid);
            if (value == 0) {
                lo = hi = mid;
                break;
            }
            if ((left < 0) == (value < 0)) lo = mid, left = value;
            else hi = mid;
        }
        roots.push_back((lo + hi) / 2);
    }
    cout << fixed << setprecision(2);
    for (int i = 0; i < 3; ++i) {
        if (fabsl(roots[i]) < 0.005L) roots[i] = 0;
        cout << roots[i] << (i == 2 ? '\n' : ' ');
    }
    return 0;
}
