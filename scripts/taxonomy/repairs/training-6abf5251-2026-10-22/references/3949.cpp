#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>s(n+1);for(int i=1;i<=n;i++){cin>>s[i];s[i]+=s[i-1];}vector<vector<long long>>d(n,vector<long long>(n));for(int length=2;length<=n;length++)for(int l=0;l+length<=n;l++){int r=l+length-1;d[l][r]=LLONG_MAX/4;for(int k=l;k<r;k++)d[l][r]=min(d[l][r],d[l][k]+d[k+1][r]+s[r+1]-s[l]);}cout<<d[0][n-1]<<"\n";}
