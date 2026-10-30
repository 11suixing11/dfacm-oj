#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<long long>d(n+1,1),prefix(n+1);for(int i=1;i<=n;i++){d[i]=1+prefix[i/2];prefix[i]=prefix[i-1]+d[i];}cout<<d[n]<<"\n";

return 0;
}
