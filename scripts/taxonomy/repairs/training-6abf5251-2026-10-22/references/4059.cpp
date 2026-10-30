#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;vector<vector<bool>>r(n,vector<bool>(n));while(m--){int a,b;cin>>a>>b;r[a-1][b-1]=true;}for(int k=0;k<n;k++)for(int i=0;i<n;i++)for(int j=0;j<n;j++)r[i][j]=r[i][j]||(r[i][k]&&r[k][j]);int answer=0;for(int i=0;i<n;i++){int lower=0,upper=0;for(int j=0;j<n;j++){lower+=r[i][j];upper+=r[j][i];}answer+=lower>n/2||upper>n/2;}cout<<answer<<"\n";

return 0;
}
