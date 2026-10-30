#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>d(n+1,LLONG_MIN/4);d[0]=0;for(int i=1;i<=n;i++){vector<long long>a(i);for(auto&x:a)cin>>x;for(int j=i-1;j>=0;j--)d[j]=max(d[j],j?d[j-1]:LLONG_MIN/4)+a[j];}cout<<*max_element(d.begin(),d.end())<<"\n";}
