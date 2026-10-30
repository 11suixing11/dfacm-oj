#include <bits/stdc++.h>
using namespace std;
string w[] = {"zero","one","two","three","four","five","six","seven","eight","nine",
"ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty"};
string tens[] = {"","","twenty","thirty","forty","fifty"};
string read(int x) {
    if (x <= 20) return w[x];
    int t = x / 10, u = x % 10;
    return tens[t] + (u ? " " + w[u] : "");
}
int main() {
    int h, m;
    cin >> h >> m;
    cout << read(h);
    if (m == 0) cout << " o'clock" << endl;
    else cout << " " << read(m) << endl;
    return 0;
}
