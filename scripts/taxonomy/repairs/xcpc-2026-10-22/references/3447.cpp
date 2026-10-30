#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,k;cin>>n>>k;vector<vector<int>>g(n);for(int i=1,u,v;i<n;i++){cin>>u>>v;--u;--v;g[u].push_back(v);g[v].push_back(u);}vector<int>p(n,-1),order={0};for(int i=0;i<n;i++)for(int v:g[order[i]])if(v!=p[order[i]]){p[v]=order[i];order.push_back(v);}vector<vector<int>>dp(n,vector<int>(k+1));ll ans=0;for(int j=n-1;j>=0;j--){int u=order[j];dp[u][0]=1;for(int v:g[u])if(v!=p[u]){for(int d=0;d<k;d++)ans+=1LL*dp[u][d]*dp[v][k-d-1];for(int d=1;d<=k;d++)dp[u][d]+=dp[v][d-1];}}cout<<ans<<'\n';}
