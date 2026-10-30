#include <bits/stdc++.h>
using namespace std;
int n,best;vector<int>a;vector<vector<int>>groups;void dfs(int p){if(int(groups.size())>=best)return;if(p==n){best=groups.size();return;}for(int j=0;j<int(groups.size());j++){bool okay=true;for(int x:groups[j])if(gcd(x,a[p])!=1)okay=false;if(okay){groups[j].push_back(a[p]);dfs(p+1);groups[j].pop_back();}}groups.push_back({a[p]});dfs(p+1);groups.pop_back();}int main(){cin>>n;a.resize(n);for(int&x:a)cin>>x;best=n+1;dfs(0);cout<<best<<"\n";}
