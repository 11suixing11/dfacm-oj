#include <bits/stdc++.h>
using namespace std;
int main() {
    long long t;
    cin >> t;
    cout << t / 3600 << ':' << t / 60 % 60 << ':' << t % 60 << endl;
    return 0;
}
