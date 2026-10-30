#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<array<int,4>>a(n);for(auto&row:a)for(int&x:row)cin>>x;vector<vector<int>>g(n);for(int i=0;i<n;i++){int x,y;cin>>x>>y;for(int j=0;j<n;j++)if(a[j][0]<=x&&x<=a[j][1]&&a[j][2]<=y&&y<=a[j][3])g[j].push_back(i);}auto match=[&](int blocku,int blockv,vector<int>&mate){mate.assign(n,-1);function<bool(int,vector<bool>&)>dfs=[&](int u,vector<bool>&used){for(int v:g[u])if(!(u==blocku&&v==blockv)&&!used[v]){used[v]=true;if(mate[v]<0||dfs(mate[v],used)){mate[v]=u;return true;}}return false;};for(int u=0;u<n;u++){vector<bool>used(n);if(!dfs(u,used))return false;}return true;};vector<int>mate,result(n),test;if(!match(-1,-1,mate)){cout<<"None\n";return 0;}for(int v=0;v<n;v++)result[mate[v]]=v;for(int u=0;u<n;u++)if(match(u,result[u],test)){cout<<"None\n";return 0;}for(int u=0;u<n;u++)cout<<char('A'+u)<<" "<<result[u]+1<<"\n";

return 0;
}
