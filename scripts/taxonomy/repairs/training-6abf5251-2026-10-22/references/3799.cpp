#include <bits/stdc++.h>
using namespace std;
int main(){int n,m,x,c=0;cin>>n>>m;vector<int>a(n*m);for(auto&x:a)cin>>x;for(auto y:a){cin>>x;c+=x==y;}cout<<fixed<<setprecision(2)<<100.0*c/(n*m)<<"\n";}
