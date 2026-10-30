#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<pair<string,int>>a(n);for(auto&x:a)cin>>x.first>>x.second;stable_sort(a.begin(),a.end(),[](auto&x,auto&y){if((x.second>=60)!=(y.second>=60))return x.second>=60;return x.second>=60?x.second>y.second:false;});for(auto&x:a)cout<<x.first<<"\n";}
