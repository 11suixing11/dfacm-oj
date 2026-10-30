#include <bits/stdc++.h>
using namespace std;
int r,c;vector<vector<int>>a,d;int dfs(int x,int y){if(d[x][y])return d[x][y];d[x][y]=1;for(auto[dx,dy]:vector<pair<int,int>>{{1,0},{-1,0},{0,1},{0,-1}}){int u=x+dx,v=y+dy;if(u>=0&&u<r&&v>=0&&v<c&&a[u][v]<a[x][y])d[x][y]=max(d[x][y],dfs(u,v)+1);}return d[x][y];}int main(){cin>>r>>c;a.assign(r,vector<int>(c));d=a;for(auto&row:a)for(int&x:row)cin>>x;int best=0;for(int i=0;i<r;i++)for(int j=0;j<c;j++)best=max(best,dfs(i,j));cout<<best<<"\n";}
