#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin>>n;
    long long current=0,answer=LLONG_MIN;
    while(n--) { long long x; cin>>x; current=max(x,current+x); answer=max(answer,current); }
    cout<<answer<<'\n';
}
