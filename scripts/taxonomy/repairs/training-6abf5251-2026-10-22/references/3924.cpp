#include <bits/stdc++.h>
using namespace std;
int main(){int r,c;cin>>r>>c;vector<string>a(r);for(auto&s:a)cin>>s;int answer=0;for(int i=0;i<r;i++)for(int j=0;j<c;j++)if(a[i][j]=='W'){answer++;queue<pair<int,int>>q;q.push({i,j});a[i][j]='.';while(!q.empty()){auto[x,y]=q.front();q.pop();for(int dx=-1;dx<=1;dx++)for(int dy=-1;dy<=1;dy++){int u=x+dx,v=y+dy;if(u>=0&&u<r&&v>=0&&v<c&&a[u][v]=='W'){a[u][v]='.';q.push({u,v});}}}}cout<<answer<<"\n";}
