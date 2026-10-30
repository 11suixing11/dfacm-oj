#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;vector<vector<pair<int,int>>>graph(n+1);while(m--){int u,v,z;cin>>u>>v>>z;graph[u].push_back({v,z});graph[v].push_back({u,z});}int start,end;cin>>start>>end;vector<long double>d(n+1);d[start]=1;priority_queue<pair<long double,int>>q;q.push({1,start});while(!q.empty()){auto[p,u]=q.top();q.pop();if(p<d[u])continue;if(u==end)break;for(auto[v,z]:graph[u]){long double next=p*(100-z)/100;if(next>d[v]){d[v]=next;q.push({next,v});}}}cout<<fixed<<setprecision(8)<<100/d[end]<<"\n";

return 0;
}
