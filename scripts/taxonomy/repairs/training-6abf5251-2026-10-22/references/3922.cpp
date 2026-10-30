#include <bits/stdc++.h>
using namespace std;
int main(){long long L;int n,m;cin>>L>>n>>m;vector<long long>a(n+1);for(int i=0;i<n;i++)cin>>a[i];a[n]=L;long long l=1,r=L;while(l<r){long long mid=(l+r+1)/2,last=0;int removed=0;for(long long x:a){if(x-last<mid)removed++;else last=x;}if(removed<=m)l=mid;else r=mid-1;}cout<<l<<"\n";}
