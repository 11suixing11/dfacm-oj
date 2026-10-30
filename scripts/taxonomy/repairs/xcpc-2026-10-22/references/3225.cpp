#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;cin>>n;vector<vector<pair<int,int>>>g(n);for(int i=1,u,v;i<n;i++){cin>>u>>v;--u;--v;g[u].push_back({v,0});g[v].push_back({u,1});}vector<int>p(n,-1),edge(n),order={0},ans(n);for(int i=0;i<(int)order.size();i++){int u=order[i];for(auto[v,w]:g[u])if(v!=p[u]){p[v]=u;edge[v]=w;ans[0]+=w;order.push_back(v);}}for(int i=1;i<n;i++){int v=order[i];ans[v]=ans[p[v]]+(edge[v]? -1:1);}int best=*min_element(ans.begin(),ans.end());cout<<best<<'\n';for(int i=0;i<n;i++)if(ans[i]==best)cout<<i+1<<' ';cout<<'\n';}
