#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin >> n;
    priority_queue<long long, vector<long long>, greater<long long>> q;
    for (int i = 0; i < n; i++) { long long x; cin >> x; q.push(x); }
    long long cost = 0;
    while (q.size() > 1) {
        long long a = q.top(); q.pop();
        long long b = q.top(); q.pop();
        cost += a + b;
        q.push(a + b);
    }
    cout << cost << endl;
    return 0;
}
