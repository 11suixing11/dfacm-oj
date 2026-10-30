#include <bits/stdc++.h>
using namespace std;
int main(){int n,k;cin>>n>>k;vector<pair<double,long long>>a(n);for(auto&x:a)cin>>x.second>>x.first;sort(a.rbegin(),a.rend());cout<<a[k-1].second<<" "<<setprecision(6)<<a[k-1].first<<"\n";}
