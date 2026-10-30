#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;vector<array<long long,3>>a(n);for(auto&row:a)cin>>row[0]>>row[1]>>row[2];auto value=[&](int i,long long x){return a[i][0]*x*x+a[i][1]*x+a[i][2];};priority_queue<tuple<long long,int,int>,vector<tuple<long long,int,int>>,greater<tuple<long long,int,int>>>q;for(int i=0;i<n;i++)q.push({value(i,1),i,1});for(int k=0;k<m;k++){auto[v,i,x]=q.top();q.pop();cout<<(k?" ":"")<<v;q.push({value(i,x+1),i,x+1});}cout<<"\n";

return 0;
}
