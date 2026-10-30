#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;vector<int>a(n*m);for(auto&x:a)cin>>x;for(int i=0;i<n;i++){for(int j=0;j<m;j++){int x;cin>>x;cout<<(j?" ":"")<<a[i*m+j]+x;}cout<<"\n";}}
