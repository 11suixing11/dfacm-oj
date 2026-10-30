#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;long long sum=0;for(auto x:a){long long y;cin>>y;sum+=x*y;}cout<<sum<<"\n";}
