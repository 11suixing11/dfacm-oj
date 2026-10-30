#include <bits/stdc++.h>
using namespace std;
int main() {
    double D1, C, D2, P;
    long long N;
    cin >> D1 >> C >> D2 >> P >> N;
    vector<double> pos(1, 0.0), price(1, P);
    for (long long i = 0; i < N; i++) {
        double d, p;
        cin >> d >> p;
        pos.push_back(d);
        price.push_back(p);
    }
    vector<int> order(pos.size());
    for (int i = 0; i < (int)order.size(); i++) order[i] = i;
    sort(order.begin() + 1, order.end(), [&](int a, int b) { return pos[a] < pos[b]; });
    const double EPS = 1e-9;
    double range = C * D2, fuel = 0, cost = 0;
    int cur = 0;
    while (true) {
        // Only stations strictly ahead of the current one can be visited next.
        int cheaper = -1, target = -1;
        for (int t = 1; t < (int)order.size(); t++) {
            int s = order[t];
            if (pos[s] <= pos[cur]) continue;
            if (pos[s] - pos[cur] > range + EPS) break;
            if (price[s] < price[cur] && cheaper == -1) cheaper = s;
            if (target == -1 || price[s] < price[target]) target = s;
        }
        if (cheaper != -1) {
            double need = (pos[cheaper] - pos[cur]) / D2;
            if (need > fuel) { cost += (need - fuel) * price[cur]; fuel = 0; }
            else fuel -= need;
            cur = cheaper;
            continue;
        }
        if (D1 - pos[cur] <= range + EPS) {
            double need = (D1 - pos[cur]) / D2;
            if (need > fuel) cost += (need - fuel) * price[cur];
            printf("%.2f\n", cost);
            return 0;
        }
        if (target == -1) {
            puts("No Solution");
            return 0;
        }
        cost += (C - fuel) * price[cur];
        fuel = C - (pos[target] - pos[cur]) / D2;
        cur = target;
    }
}
