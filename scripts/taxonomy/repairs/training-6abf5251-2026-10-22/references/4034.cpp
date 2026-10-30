#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int a[12][12]={};bool seen[12][12]={};for(int i=1;i<=10;i++)for(int j=1;j<=10;j++)cin>>a[i][j];queue<pair<int,int>>q;q.push({0,0});seen[0][0]=true;int dx[]={-1,1,0,0},dy[]={0,0,-1,1};while(!q.empty()){auto[x,y]=q.front();q.pop();for(int k=0;k<4;k++){int u=x+dx[k],v=y+dy[k];if(u>=0&&u<12&&v>=0&&v<12&&!seen[u][v]&&!a[u][v]){seen[u][v]=true;q.push({u,v});}}}int count=0;for(int i=1;i<=10;i++)for(int j=1;j<=10;j++)count+=!a[i][j]&&!seen[i][j];cout<<count<<"\n";

return 0;
}
