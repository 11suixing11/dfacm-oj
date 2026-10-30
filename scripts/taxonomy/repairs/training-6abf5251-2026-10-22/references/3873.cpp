#include <bits/stdc++.h>
using namespace std;
int main(){int m,n;cin>>m>>n;vector<long long>x(m+1);for(int i=2;i<=m;i++){cin>>x[i];x[i]+=x[i-1];}vector<vector<long long>>c(m+1,vector<long long>(m+1));for(int l=1;l<=m;l++)for(int r=l+1;r<=m;r++)c[l][r]=c[l][r-1]+x[r]-x[(l+r)/2];const long long INF=LLONG_MAX/4;vector<long long>a(m+1,INF);a[0]=0;for(int schools=1;schools<=n;schools++){vector<long long>b(m+1,INF);for(int r=schools;r<=m;r++)for(int l=schools-1;l<r;l++)b[r]=min(b[r],a[l]+c[l+1][r]);a=b;}cout<<a[m]<<"\n";}
