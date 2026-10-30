#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,p,m;cin>>n>>p>>m;vector<int>count(p);for(int i=0;i<n;i++){int x;cin>>x;count[x-1]++;}vector<vector<pair<int,int>>>graph(p);while(m--){int a,b,w;cin>>a>>b>>w;--a;--b;graph[a].push_back({b,w});graph[b].push_back({a,w});}const long long INF=LLONG_MAX/8;long long answer=INF;for(int start=0;start<p;start++){vector<long long>d(p,INF);d[start]=0;priority_queue<pair<long long,int>,vector<pair<long long,int>>,greater<pair<long long,int>>>q;q.push({0,start});while(!q.empty()){auto[distance,u]=q.top();q.pop();if(distance!=d[u])continue;for(auto[v,w]:graph[u])if(distance+w<d[v]){d[v]=distance+w;q.push({d[v],v});}}long long sum=0;bool possible=true;for(int i=0;i<p;i++)if(count[i]){if(d[i]==INF){possible=false;break;}sum+=count[i]*d[i];}if(possible)answer=min(answer,sum);}cout<<answer<<"\n";

return 0;
}
