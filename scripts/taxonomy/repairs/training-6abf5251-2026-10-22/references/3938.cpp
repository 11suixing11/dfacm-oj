#include <bits/stdc++.h>
using namespace std;
int lis(vector<int>a,bool weak=false){vector<int>d;for(int x:a){auto it=weak?upper_bound(d.begin(),d.end(),x):lower_bound(d.begin(),d.end(),x);if(it==d.end())d.push_back(x);else *it=x;}return d.size();}int main(){int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[x,y]:a)cin>>x>>y;sort(a.begin(),a.end());vector<int>b;for(auto[x,y]:a)b.push_back(y);cout<<lis(b)<<"\n";}
