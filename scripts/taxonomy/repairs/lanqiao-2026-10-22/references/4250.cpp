#include <bits/stdc++.h>
using namespace std;
int main() {
    int s, t, w;
    string cur;
    cin >> s >> t >> w >> cur;
    vector<int> d(w);
    for (int i = 0; i < w; i++) d[i] = cur[i] - 'a' + 1;
    for (int cnt = 0; cnt < 5; cnt++) {
        int i = w - 1;
        while (i >= 0 && d[i] == t - (w - 1 - i)) i--;
        if (i < 0) break;
        d[i]++;
        for (int j = i + 1; j < w; j++) d[j] = d[j-1] + 1;
        for (int j = 0; j < w; j++) putchar('a' + d[j] - 1);
        putchar('\n');
    }
    return 0;
}
