#include <bits/stdc++.h>
using namespace std;
int main() {
    double x1, y1, x2, y2, X1, Y1, X2, Y2;
    cin >> x1 >> y1 >> x2 >> y2 >> X1 >> Y1 >> X2 >> Y2;
    if (x1 > x2) swap(x1, x2);
    if (y1 > y2) swap(y1, y2);
    if (X1 > X2) swap(X1, X2);
    if (Y1 > Y2) swap(Y1, Y2);
    double w = min(x2, X2) - max(x1, X1);
    double h = min(y2, Y2) - max(y1, Y1);
    double area = max(0.0, w) * max(0.0, h);
    printf("%.2f\n", area);
    return 0;
}
