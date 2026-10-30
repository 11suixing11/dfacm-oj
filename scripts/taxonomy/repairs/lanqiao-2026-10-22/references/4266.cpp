#include <bits/stdc++.h>
using namespace std;
int main() {
    string s;
    getline(cin, s);
    char ch;
    cin >> ch;
    for (char c : s) if (c != ch) putchar(c);
    putchar('\n');
    return 0;
}
