#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[x,y]:a)cin>>x>>y;const long double INF=numeric_limits<long double>::infinity();vector<vector<long double>>d(n,vector<long double>(n,INF));for(int i=0;i<n;i++)d[i][i]=0;int m;cin>>m;while(m--){int u,v;cin>>u>>v;--u;--v;d[u][v]=d[v][u]=hypotl((long double)a[u].first-a[v].first,(long double)a[u].second-a[v].second);}for(int k=0;k<n;k++)for(int i=0;i<n;i++)for(int j=0;j<n;j++)d[i][j]=min(d[i][j],d[i][k]+d[k][j]);int s,t;cin>>s>>t;cout<<fixed<<setprecision(2)<<d[s-1][t-1]<<"\n";

return 0;
}
