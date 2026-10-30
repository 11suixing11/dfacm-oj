#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);
int n,m;cin>>n>>m;vector<string>a(n,string(m,'0'));for(auto&row:a)cin>>row;
int answer=0;for(int i=0;i<n;i++)for(int j=0;j<m;j++)if(a[i][j]!='0'){answer++;queue<pair<int,int>>q;q.push({i,j});a[i][j]='0';while(!q.empty()){auto[x,y]=q.front();q.pop();for(auto[dx,dy]:vector<pair<int,int>>{{0,1},{0,-1},{1,0},{-1,0}}){int r=x+dx,c=y+dy;if(r>=0&&r<n&&c>=0&&c<m&&a[r][c]!='0'){a[r][c]='0';q.push({r,c});}}}}cout<<answer<<"\n";

return 0;
}
