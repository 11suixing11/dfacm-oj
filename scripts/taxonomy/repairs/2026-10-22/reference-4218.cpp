#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin>>n;
    while(n--) { int t; cin>>t; printf("%02d:%02d:%02d\n",t/3600,t/60%60,t%60); }
}
