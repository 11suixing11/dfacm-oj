#include <bits/stdc++.h>
using namespace std;
int main(){int n,i,j;cin>>n>>i>>j;vector<pair<int,int>>rows[4];for(int x=1;x<=n;x++){rows[0].push_back({i,x});rows[1].push_back({x,j});if(1<=j+x-i&&j+x-i<=n)rows[2].push_back({x,j+x-i});}for(int x=n;x>=1;x--)if(1<=i+j-x&&i+j-x<=n)rows[3].push_back({x,i+j-x});for(auto&r:rows){for(size_t k=0;k<r.size();k++){if(k)cout<<" ";cout<<"("<<r[k].first<<","<<r[k].second<<")";}cout<<"\n";}}
