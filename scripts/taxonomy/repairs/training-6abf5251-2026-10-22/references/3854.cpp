#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<pair<string,int>>a(n);for(auto&x:a)cin>>x.first>>x.second;sort(a.begin(),a.end(),[](auto&x,auto&y){return x.second!=y.second?x.second>y.second:x.first<y.first;});for(auto&x:a)cout<<x.first<<" "<<x.second<<"\n";}
