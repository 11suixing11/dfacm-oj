#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n,m;cin>>n>>m;vector<vector<pair<int,int>>>g(n);for(int i=0,u,v,w;i<m;i++){cin>>u>>v>>w;--u;--v;g[u].push_back({v,w});g[v].push_back({u,w});}vector<vector<int>>t(n);for(auto&v:t){int k;cin>>k;v.resize(k);for(auto&x:v)cin>>x;}vector<ll>d(n,LLONG_MAX/4);d[0]=0;priority_queue<pair<ll,int>,vector<pair<ll,int>>,greater<pair<ll,int>>>q;q.push({0,0});while(!q.empty()){auto[du,u]=q.top();q.pop();if(du!=d[u])continue;if(u==n-1){cout<<du<<'\n';return 0;}ll departure=du;auto it=lower_bound(t[u].begin(),t[u].end(),departure);while(it!=t[u].end()&&*it==departure){++departure;++it;}for(auto[v,w]:g[u])if(departure+w<d[v]){d[v]=departure+w;q.push({d[v],v});}}cout<<-1<<'\n';}
