#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,k;cin>>n>>k;const long long NEG=LLONG_MIN/4;vector<long long>d(k,NEG);d[0]=0;while(n--){int x;cin>>x;vector<long long>b=d;for(int j=0;j<k;j++)if(d[j]!=NEG)b[(j+x)%k]=max(b[(j+x)%k],d[j]+x);d=b;}cout<<d[0]<<"\n";

return 0;
}
