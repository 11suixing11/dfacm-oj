#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<pair<int,int>>a(n);for(auto&[x,y]:a)cin>>x>>y;sort(a.rbegin(),a.rend());vector<pair<int,int>>ans;int y=-1;for(auto p:a)if(p.second>y){ans.push_back(p);y=p.second;}reverse(ans.begin(),ans.end());for(int i=0;i<int(ans.size());i++){if(i)cout<<',';cout<<'('<<ans[i].first<<','<<ans[i].second<<')';}cout<<"\n";}
