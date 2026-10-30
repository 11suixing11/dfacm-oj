#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;long long m;cin>>m;sort(a.begin(),a.end());int l=0,r=n-1;while(l<r){long long sum=a[l]+a[r];if(sum==m){cout<<a[l]<<' '<<a[r]<<"\n";return 0;}if(sum<m)l++;else r--;}cout<<"No\n";}
