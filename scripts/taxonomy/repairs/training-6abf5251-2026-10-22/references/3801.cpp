#include <bits/stdc++.h>
using namespace std;
int main(){int n,m,k;cin>>n>>m>>k;vector<vector<long long>>a(n,vector<long long>(m)),b(m,vector<long long>(k));for(auto&r:a)for(auto&x:r)cin>>x;for(auto&r:b)for(auto&x:r)cin>>x;for(int i=0;i<n;i++){for(int j=0;j<k;j++){long long s=0;for(int t=0;t<m;t++)s+=a[i][t]*b[t][j];cout<<(j?" ":"")<<s;}cout<<"\n";}}
