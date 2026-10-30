#include <bits/stdc++.h>
using namespace std;
int main() {
    int S; double t; int A, B;
    cin >> S >> t >> A >> B;
    vector<double> X(S*4), Y(S*4);
    vector<double> T(S);
    for (int c = 0; c < S; c++) {
        double x1,y1,x2,y2,x3,y3; double ti;
        cin >> x1 >> y1 >> x2 >> y2 >> x3 >> y3 >> ti;
        double dx = 0, dy = 0;
        double px[3] = {x1,x2,x3}, py[3] = {y1,y2,y3};
        for (int k = 0; k < 3; k++) {
            int a = (k+1)%3, b = (k+2)%3;
            if ((px[a]-px[k])*(px[b]-px[k]) + (py[a]-py[k])*(py[b]-py[k]) == 0) {
                dx = px[a]+px[b]-px[k]; dy = py[a]+py[b]-py[k];
            }
        }
        X[c*4]=x1; Y[c*4]=y1; X[c*4+1]=x2; Y[c*4+1]=y2; X[c*4+2]=x3; Y[c*4+2]=y3; X[c*4+3]=dx; Y[c*4+3]=dy;
        T[c] = ti;
    }
    int N = S * 4;
    vector<double> dist(N, 1e18);
    auto cost = [&](int u, int v) {
        double d = hypot(X[u]-X[v], Y[u]-Y[v]);
        return (u/4 == v/4 ? T[u/4] : t) * d;
    };
    for (int u = 0; u < 4; u++) dist[(A-1)*4+u] = 0;
    vector<bool> vis(N, false);
    for (int it = 0; it < N; it++) {
        int u = -1;
        for (int j = 0; j < N; j++) if (!vis[j] && (u < 0 || dist[j] < dist[u])) u = j;
        if (u < 0 || dist[u] > 1e17) break;
        vis[u] = true;
        for (int v = 0; v < N; v++) if (v != u) {
            double w = cost(u, v);
            if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
        }
    }
    double best = 1e18;
    for (int u = 0; u < 4; u++) best = min(best, dist[(B-1)*4+u]);
    printf("%.1f\n", best);
    return 0;
}
