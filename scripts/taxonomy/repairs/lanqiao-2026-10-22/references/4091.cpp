#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    long double sum = 0;
    for (int i = 0; i < n; i++) {
        string name; long double p; int q;
        cin >> name >> p >> q;
        sum += p * q;
    }
    printf("%.6Lf\n", sum);
    return 0;
}
