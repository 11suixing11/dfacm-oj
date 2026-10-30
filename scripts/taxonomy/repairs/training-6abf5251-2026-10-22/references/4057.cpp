#include <bits/stdc++.h>
using namespace std;

vector<long long> shortest(const vector<vector<pair<int,long long>>>&g,int s){const long long INF=LLONG_MAX/4;vector<long long>d(g.size(),INF);d[s]=0;priority_queue<pair<long long,int>,vector<pair<long long,int>>,greater<pair<long long,int>>>q;q.push({0,s});while(!q.empty()){auto[x,u]=q.top();q.pop();if(x!=d[u])continue;for(auto[v,w]:g[u])if(x+w<d[v]){d[v]=x+w;q.push({d[v],v});}}return d;}

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);
int n,m;cin>>n>>m;int s=1,t=n;vector<vector<pair<int,long long>>>g(n);while(m--){int a,b;long long w;cin>>a>>b>>w;g[a-1].push_back({b-1,w});g[b-1].push_back({a-1,w});}auto d=shortest(g,s-1);long long answer=d[t-1];cout<<(answer==LLONG_MAX/4?-1:answer)<<"\n";
return 0;
}
