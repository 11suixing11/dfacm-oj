#include <bits/stdc++.h>
using namespace std;
int n,m;long long ans;bool seen[5][5];int dx[]={1,1,-1,-1,2,2,-2,-2},dy[]={2,-2,2,-2,1,-1,1,-1};void dfs(int x,int y,int depth){if(depth==n*m){ans++;return;}for(int i=0;i<8;i++){int r=x+dx[i],c=y+dy[i];if(r>=0&&r<n&&c>=0&&c<m&&!seen[r][c]){seen[r][c]=true;dfs(r,c,depth+1);seen[r][c]=false;}}}int main(){int t,x,y;cin>>t;while(t--){cin>>n>>m>>x>>y;memset(seen,0,sizeof(seen));seen[x][y]=true;ans=0;dfs(x,y,1);cout<<ans<<"\n";}}
