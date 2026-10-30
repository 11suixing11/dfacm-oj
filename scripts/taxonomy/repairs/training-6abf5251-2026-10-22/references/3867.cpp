#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n;vector<string>a(n);for(auto&s:a)cin>>s;cin>>m;for(int d=1;d<m;d++){auto b=a;for(int i=0;i<n;i++)for(int j=0;j<n;j++)if(a[i][j]=='@')for(auto [di,dj]:{pair{1,0},pair{-1,0},pair{0,1},pair{0,-1}}){int r=i+di,c=j+dj;if(r>=0&&r<n&&c>=0&&c<n&&a[r][c]=='.')b[r][c]='@';}a=b;}int s=0;for(auto&r:a)s+=count(r.begin(),r.end(),'@');cout<<s<<"\n";}
