#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string n;int k;cin>>n>>k;bool g[10][10]={};for(int i=0;i<10;i++)g[i][i]=true;while(k--){int a,b;cin>>a>>b;g[a][b]=true;}for(int j=0;j<10;j++)for(int i=0;i<10;i++)for(int l=0;l<10;l++)g[i][l]=g[i][l]||(g[i][j]&&g[j][l]);long long answer=1;for(char c:n)answer*=count(g[c-'0'],g[c-'0']+10,true);cout<<answer<<"\n";

return 0;
}
