#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;vector<vector<int>>a(n,vector<int>(m));for(auto&r:a)for(auto&x:r)cin>>x;for(int j=0;j<m;j++){for(int i=0;i<n;i++)cout<<(i?" ":"")<<a[i][j];cout<<"\n";}}
