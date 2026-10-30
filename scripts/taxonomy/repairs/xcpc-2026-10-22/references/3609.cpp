#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,m;cin>>n>>m;vector<int>adj(n);for(int i=0,a,b;i<m;i++){cin>>a>>b;--a;--b;adj[a]|=1<<b;adj[b]|=1<<a;}int size=1<<n;vector<ll>dp((size_t)size*n);for(int i=0;i<n;i++)dp[(1<<i)*n+i]=1;ll answer=0;for(int mask=1;mask<size;mask++){int start=__builtin_ctz((unsigned)mask),cnt=__builtin_popcount((unsigned)mask);for(int bits=mask;bits;bits&=bits-1){int u=__builtin_ctz((unsigned)bits);ll ways=dp[(size_t)mask*n+u];if(!ways)continue;if(cnt>=3&&(adj[u]>>start&1))answer+=ways;int available=adj[u]&~mask&~((1<<(start+1))-1);for(;available;available&=available-1){int v=__builtin_ctz((unsigned)available);dp[(size_t)(mask|(1<<v))*n+v]+=ways;}}}cout<<answer/2<<'\n';}
