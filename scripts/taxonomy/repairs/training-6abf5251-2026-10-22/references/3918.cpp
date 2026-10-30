#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;vector<long long>a(n);long long l=0,r=0;for(auto&x:a){cin>>x;l=max(l,x);r+=x;}while(l<r){long long mid=(l+r)/2,total=0;int months=1;for(auto x:a){if(total+x>mid){months++;total=0;}total+=x;}if(months<=m)r=mid;else l=mid+1;}cout<<l<<"\n";}
