#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

vector<vector<int>>d(101,vector<int>(101,-1));queue<pair<int,int>>q;q.push({1,1});d[1][1]=0;while(!q.empty()){auto[x,y]=q.front();q.pop();for(auto[a,b]:vector<pair<int,int>>{{1,2},{2,1},{2,2}})for(int sx:{-1,1})for(int sy:{-1,1}){int r=x+sx*a,c=y+sy*b;if(r>=1&&r<=100&&c>=1&&c<=100&&d[r][c]==-1){d[r][c]=d[x][y]+1;q.push({r,c});}}}int x,y;while(cin>>x>>y)cout<<d[x][y]<<"\n";

return 0;
}
