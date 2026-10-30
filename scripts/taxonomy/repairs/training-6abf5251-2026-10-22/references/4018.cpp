#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[x,y]:a)cin>>x>>y;const long double INF=numeric_limits<long double>::infinity();vector<vector<long double>>d(n,vector<long double>(n,INF));auto distance=[&](int i,int j){return hypotl((long double)a[i].first-a[j].first,(long double)a[i].second-a[j].second);};for(int i=0;i<n;i++){string s;cin>>s;for(int j=0;j<n;j++)if(i==j)d[i][j]=0;else if(s[j]=='1')d[i][j]=distance(i,j);}for(int k=0;k<n;k++)for(int i=0;i<n;i++)for(int j=0;j<n;j++)d[i][j]=min(d[i][j],d[i][k]+d[k][j]);vector<long double>ecc(n);long double original=0;for(int i=0;i<n;i++){for(int j=0;j<n;j++)if(isfinite(d[i][j]))ecc[i]=max(ecc[i],d[i][j]);original=max(original,ecc[i]);}long double answer=INF;for(int i=0;i<n;i++)for(int j=0;j<i;j++)if(!isfinite(d[i][j]))answer=min(answer,max(original,ecc[i]+distance(i,j)+ecc[j]));if(!isfinite(answer))answer=original;cout<<fixed<<setprecision(6)<<answer<<"\n";

return 0;
}
