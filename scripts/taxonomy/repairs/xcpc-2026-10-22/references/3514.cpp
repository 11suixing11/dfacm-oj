#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,m,s;cin>>n>>m>>s;--s;vector<tuple<int,int,ll>>es;vector<vector<pair<int,ll>>>g(n);for(int i=0,u,v;i<m;i++){ll w;cin>>u>>v>>w;--u;--v;es.push_back({u,v,w});g[u].push_back({v,w});g[v].push_back({u,w});}ll L;cin>>L;vector<ll>d(n,LLONG_MAX/4);d[s]=0;priority_queue<pair<ll,int>,vector<pair<ll,int>>,greater<pair<ll,int>>>q;q.push({0,s});while(!q.empty()){auto[du,u]=q.top();q.pop();if(du!=d[u])continue;for(auto[v,w]:g[u])if(du+w<d[v]){d[v]=du+w;q.push({d[v],v});}}ll ans=count(d.begin(),d.end(),L);for(auto[u,v,w]:es){ll x=L-d[u],y=L-d[v];bool a=x>0&&x<w&&d[v]+w-x>=L,b=y>0&&y<w&&d[u]+w-y>=L;ans+=a+b;if(a&&b&&x+y==w)ans--;}cout<<ans<<'\n';}
