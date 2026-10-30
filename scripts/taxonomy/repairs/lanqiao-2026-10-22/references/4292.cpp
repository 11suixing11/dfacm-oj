#include <bits/stdc++.h>
using namespace std;
int main() {
    string best, current;
    for (int i = 0; i < 5; i++) {
        cin >> current;
        if (current.size() > best.size()) best = current;
    }
    cout << best << '\n';
    return 0;
}
