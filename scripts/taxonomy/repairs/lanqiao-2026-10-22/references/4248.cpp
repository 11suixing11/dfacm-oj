#include <bits/stdc++.h>
using namespace std;
long long gcd(long long a, long long b) { return b ? gcd(b, a % b) : a; }
bool check(long long x, long long a0, long long a1, long long b0, long long b1) {
    if (x % a1) return false;
    if (gcd(x, a0) != a1) return false;
    long long g = gcd(x, b0);
    return x / g * b0 == b1;
}
int main() {
    int n; 
    scanf("%d", &n);
    while (n--) {
        long long a0, a1, b0, b1;
        scanf("%lld %lld %lld %lld", &a0, &a1, &b0, &b1);
        unsigned b = (unsigned)b1;
        unsigned lim = (unsigned)sqrt((double)b);
        while ((unsigned long long)(lim + 1) * (lim + 1) <= b) lim++;
        long long cnt = 0;
        for (unsigned d = 1; d <= lim; d++)
            if (b % d == 0) {
                if (check(d, a0, a1, b0, b1)) cnt++;
                if ((unsigned long long)d * d != b && check(b1 / d, a0, a1, b0, b1)) cnt++;
            }
        printf("%lld\n", cnt);
    }
    return 0;
}
