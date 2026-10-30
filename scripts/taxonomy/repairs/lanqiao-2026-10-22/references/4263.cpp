#include <bits/stdc++.h>
using namespace std;
int main() {
    int L;
    string s;
    cin >> L >> s;
    int n = s.size();
    string best;
    int bestCnt = 0;
    for (int len = L; len <= n; len++)
        for (int i = 0; i + len <= n; i++) {
            string sub = s.substr(i, len);
            int cnt = 0;
            for (int j = 0; j + len <= n; j++)
                if (s.compare(j, len, sub) == 0) cnt++;
            if (cnt > bestCnt || (cnt == bestCnt && (int)sub.size() > (int)best.size())) {
                best = sub;
                bestCnt = cnt;
            }
        }
    cout << best << endl;
    return 0;
}
