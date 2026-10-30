#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n;vector<int>a(n);for(auto &x:a)cin>>x;cin>>m;cout<<count(a.begin(),a.end(),m)<<"\n";}
