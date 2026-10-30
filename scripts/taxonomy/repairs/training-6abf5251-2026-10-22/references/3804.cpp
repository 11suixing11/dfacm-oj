#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;vector<vector<int>>a(n,vector<int>(m));for(auto&r:a)for(auto&x:r)cin>>x;for(int i=0;i<n;i++){for(int j=0;j<m;j++){int x=a[i][j];if(i&&i<n-1&&j&&j<m-1)x=(x+a[i-1][j]+a[i+1][j]+a[i][j-1]+a[i][j+1]+2)/5;cout<<(j?" ":"")<<x;}cout<<"\n";}}
