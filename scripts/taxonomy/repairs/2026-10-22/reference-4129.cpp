#include <bits/stdc++.h>
using namespace std;
double GetReal() { double x; cin >> x; return x; }
string GetString() { string s; cin >> s; return s; }
int main() {
    cout << "please input a number:\n";
    double x=GetReal();
    cout << "please input a string:\n";
    string s=GetString();
    cout << fixed << setprecision(2) << x << '\n' << s << '\n';
}
