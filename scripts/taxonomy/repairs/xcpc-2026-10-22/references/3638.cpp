#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,m;cin>>n>>m;if(n<m)swap(n,m);int S=1<<m,full=S-1,INF=100;vector<vector<int>>dp(S,vector<int>(S,INF));dp[full][0]=0;for(int row=0;row<n;row++){vector<vector<int>>next(S,vector<int>(S,INF));for(int a=0;a<S;a++)for(int b=0;b<S;b++)if(dp[a][b]<INF){int need=full&~(a|b|(b<<1)|(b>>1));for(int c=0;c<S;c++)if((c&need)==need)next[b][c]=min(next[b][c],dp[a][b]+__builtin_popcount((unsigned)c));}dp.swap(next);}int best=INF;for(int a=0;a<S;a++)for(int b=0;b<S;b++)if(((a|b|(b<<1)|(b>>1))&full)==full)best=min(best,dp[a][b]);cout<<n*m-best<<'\n';}
