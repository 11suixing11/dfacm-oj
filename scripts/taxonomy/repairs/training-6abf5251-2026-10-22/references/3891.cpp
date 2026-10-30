#include <bits/stdc++.h>
using namespace std;
int main(){int t;cin>>t;while(t--){int n;cin>>n;vector<string>a(n);for(auto&s:a)cin>>s;int x,y,u,v;cin>>x>>y>>u>>v;vector<vector<bool>>vis(n,vector<bool>(n));queue<pair<int,int>>q;if(a[x][y]!='#'){vis[x][y]=true;q.push({x,y});}while(!q.empty()){auto [r,c]=q.front();q.pop();for(auto [dr,dc]:vector<pair<int,int>>{{1,0},{-1,0},{0,1},{0,-1}}){int i=r+dr,j=c+dc;if(i>=0&&i<n&&j>=0&&j<n&&!vis[i][j]&&a[i][j]!='#'){vis[i][j]=true;q.push({i,j});}}}cout<<(vis[u][v]?"YES":"NO")<<"\n";}}
