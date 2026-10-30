#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n;vector<long long>a(n);for(auto&x:a)cin>>x;cin>>m;while(m--){long long x;cin>>x;auto it=lower_bound(a.begin(),a.end(),x);long long answer;if(it==a.begin())answer=*it;else if(it==a.end())answer=a.back();else answer=x-*(it-1)<=*it-x?*(it-1):*it;cout<<answer<<"\n";}}
