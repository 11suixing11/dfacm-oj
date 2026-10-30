#include <bits/stdc++.h>
using namespace std;
int main() {
    long long k, n;
    cin >> k >> n;
    // The N-th term is N's binary representation read in base k,
    // so the digits must be consumed from the most significant bit.
    long long value = 0;
    for (int e = 62; e >= 0; e--)
        value = value * k + ((n >> e) & 1);
    cout << value << '\n';
    return 0;
}
