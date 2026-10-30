#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m,x,y;cin>>n>>m>>x>>y;vector<vector<bool>>blocked(n+1,vector<bool>(m+1));vector<pair<int,int>>moves={{0,0},{1,2},{1,-2},{-1,2},{-1,-2},{2,1},{2,-1},{-2,1},{-2,-1}};for(auto [a,b]:moves)if(x+a>=0&&x+a<=n&&y+b>=0&&y+b<=m)blocked[x+a][y+b]=true;vector<vector<long long>>d(n+1,vector<long long>(m+1));for(int i=0;i<=n;i++)for(int j=0;j<=m;j++)if(!blocked[i][j]){if(i==0&&j==0)d[i][j]=1;else d[i][j]=(i?d[i-1][j]:0)+(j?d[i][j-1]:0);}cout<<d[n][m]<<"\n";

return 0;
}
