#include <bits/stdc++.h>
using namespace std;
int main() {
    int a, b, c, d;
    cin >> a >> b >> c >> d;
    int rec[5][4] = {{2,1,0,2},{1,1,1,1},{0,0,2,1},{0,3,0,0},{1,0,0,1}};
    int have[4] = {a, b, c, d};
    for (int i = 0; i < 5; i++) {
        int cnt = 0;
        while (have[0] >= rec[i][0] && have[1] >= rec[i][1] && have[2] >= rec[i][2] && have[3] >= rec[i][3]) {
            for (int k = 0; k < 4; k++) have[k] -= rec[i][k];
            cnt++;
        }
        cout << cnt << "\n";
    }
    return 0;
}
