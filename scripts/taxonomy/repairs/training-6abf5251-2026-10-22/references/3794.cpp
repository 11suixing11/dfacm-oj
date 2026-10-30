#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<array<long long,4>>a(n);for(auto&r:a)for(auto&x:r)cin>>x;long long x,y;cin>>x>>y;for(int i=n-1;i>=0;i--)if(a[i][0]<=x&&x<=a[i][0]+a[i][2]&&a[i][1]<=y&&y<=a[i][1]+a[i][3]){cout<<i+1<<"\n";return 0;}cout<<"-1\n";}
