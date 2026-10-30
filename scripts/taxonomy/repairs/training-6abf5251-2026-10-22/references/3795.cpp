#include <bits/stdc++.h>
using namespace std;
int main(){int a[5][5],m,n;for(auto&r:a)for(auto&x:r)cin>>x;cin>>m>>n;for(int j=0;j<5;j++)swap(a[m-1][j],a[n-1][j]);for(auto&r:a){for(int j=0;j<5;j++)cout<<(j?" ":"")<<r[j];cout<<"\n";}}
