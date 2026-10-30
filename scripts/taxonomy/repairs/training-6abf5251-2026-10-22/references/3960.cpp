#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n),d(n);for(auto&x:a)cin>>x;long long best=LLONG_MIN;for(int i=0;i<n;i++){d[i]=a[i];for(int j=0;j<i;j++)if(a[j]<a[i])d[i]=max(d[i],d[j]+a[i]);best=max(best,d[i]);}cout<<best<<"\n";}
