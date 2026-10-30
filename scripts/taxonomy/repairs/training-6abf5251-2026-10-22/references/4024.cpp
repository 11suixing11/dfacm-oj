#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<vector<long long>>a(n,vector<long long>(n));for(auto&row:a)for(auto&x:row)cin>>x;vector<long long>d(n,LLONG_MAX);vector<bool>used(n);d[0]=0;long long answer=0;for(int k=0;k<n;k++){int u=-1;for(int i=0;i<n;i++)if(!used[i]&&(u<0||d[i]<d[u]))u=i;used[u]=true;answer+=d[u];for(int v=0;v<n;v++)if(!used[v])d[v]=min(d[v],a[u][v]);}cout<<answer<<"\n";

return 0;
}
