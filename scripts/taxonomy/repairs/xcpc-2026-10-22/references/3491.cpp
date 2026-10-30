#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n;cin>>n;vector<vector<int>>g(n);vector<pair<int,int>>es;for(int i=1,u,v;i<n;i++){cin>>u>>v;--u;--v;g[u].push_back(v);g[v].push_back(u);es.push_back({u,v});}auto diam=[&](int start,int a,int b){auto bfs=[&](int s){vector<int>d(n,-1);queue<int>q;q.push(s);d[s]=0;int far=s;while(!q.empty()){int u=q.front();q.pop();if(d[u]>d[far])far=u;for(int v:g[u])if(!((u==a&&v==b)||(u==b&&v==a))&&d[v]<0){d[v]=d[u]+1;q.push(v);}}return pair<int,int>{far,d[far]};};return bfs(bfs(start).first).second;};int ans=0;for(auto[a,b]:es)ans=max(ans,diam(a,a,b)*diam(b,a,b));cout<<ans<<'\n';}
