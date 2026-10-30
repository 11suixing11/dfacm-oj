#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,k;cin>>n>>k;vector<long long>d(n-k+1);d[0]=1;for(int x=1;x<=k;x++)for(int s=x;s<=n-k;s++)d[s]+=d[s-x];cout<<d[n-k]<<"\n";

return 0;
}
