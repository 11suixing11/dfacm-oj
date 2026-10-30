#include <bits/stdc++.h>
using namespace std;
int main() {
    int n; cin>>n; long long delta[3]={};
    for(int i=0;i<n;++i) {
        long long a,b,c,d,e,f,t; cin>>a>>b>>c>>d>>e>>f>>t;
        delta[0]+=(a-d)*t; delta[1]+=(b-e)*t; delta[2]+=(c-f)*t;
    }
    long long a,b,c,d,e,f; cin>>a>>b>>c>>d>>e>>f;
    delta[0]+=a-d; delta[1]+=b-e; delta[2]+=c-f;
    long double sq=0; for(auto x:delta) sq+=(long double)x*x;
    cout<<fixed<<setprecision(4)<<sqrtl(sq)<<'\n';
}
