#include <bits/stdc++.h>
using namespace std;
int main(){int t;cin>>t;while(t--){int w,s;cin>>w>>s;vector<pair<int,int>>a(s);for(auto&[mass,value]:a)cin>>mass>>value;sort(a.begin(),a.end(),[](auto x,auto y){return 1LL*x.second*y.first>1LL*y.second*x.first;});long double total=0;for(auto [mass,value]:a){int take=min(w,mass);total+=(long double)take*value/mass;w-=take;}cout<<fixed<<setprecision(2)<<total<<"\n";}}
