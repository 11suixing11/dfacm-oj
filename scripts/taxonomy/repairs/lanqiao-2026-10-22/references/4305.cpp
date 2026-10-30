#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> circle(n);
    for (int i = 0; i < n; i++) circle[i] = i + 1;
    int position = 0;
    while ((int)circle.size() > 1) {
        position = (position + 2) % circle.size();
        circle.erase(circle.begin() + position);
        if (position == (int)circle.size()) position = 0;
    }
    cout << circle[0] << '\n';
    return 0;
}
