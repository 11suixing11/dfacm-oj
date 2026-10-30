#include <bits/stdc++.h>
using namespace std;
int main() {
    for (int n = 1000; n <= 9999; n++) {
        int sum = 0, value = n;
        while (value) { sum += value % 10; value /= 10; }
        if (sum == 10) cout << n << '\n';
    }
    return 0;
}
