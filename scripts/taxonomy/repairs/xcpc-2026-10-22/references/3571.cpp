#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,m;cin>>n>>m;vector<vector<int>>g(n);vector<int>d(n);for(int i=0,u,v;i<m;i++){cin>>u>>v;--u;--v;g[u].push_back(v);g[v].push_back(u);d[u]++;d[v]++;}vector<bool>gone(n);int rounds=0;while(true){vector<int>remove;for(int u=0;u<n;u++)if(!gone[u]&&d[u]==1)remove.push_back(u);if(remove.empty())break;rounds++;for(int u:remove)gone[u]=true;for(int u:remove)for(int v:g[u])if(!gone[v])d[v]--;}cout<<rounds<<'\n';}
