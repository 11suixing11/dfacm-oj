#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

long long b,p,k;cin>>b>>p>>k;long long original=b,exponent=p,result=1%k;b%=k;while(p){if(p&1)result=result*b%k;b=b*b%k;p>>=1;}cout<<original<<"^"<<exponent<<" mod "<<k<<"="<<result<<"\n";

return 0;
}
