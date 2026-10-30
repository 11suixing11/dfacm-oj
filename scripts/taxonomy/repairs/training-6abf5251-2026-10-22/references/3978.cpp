#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int T;cin>>T;while(T--){int m,n;cin>>m>>n;vector<long long>d(m+1);d[0]=1;for(int x=1;x<=n;x++)for(int s=x;s<=m;s++)d[s]+=d[s-x];cout<<d[m]<<"\n";}

return 0;
}
