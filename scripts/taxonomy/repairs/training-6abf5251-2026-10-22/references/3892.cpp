#include <bits/stdc++.h>
using namespace std;
int main(){int w,h;while(cin>>w>>h&&(w||h)){vector<string>a(h);queue<pair<int,int>>q;for(int r=0;r<h;r++){cin>>a[r];for(int c=0;c<w;c++)if(a[r][c]=='@'){q.push({r,c});a[r][c]='#';}}int ans=0;while(!q.empty()){auto [r,c]=q.front();q.pop();ans++;for(auto [dr,dc]:vector<pair<int,int>>{{1,0},{-1,0},{0,1},{0,-1}}){int i=r+dr,j=c+dc;if(i>=0&&i<h&&j>=0&&j<w&&a[i][j]=='.'){a[i][j]='#';q.push({i,j});}}}cout<<ans<<"\n";}}
