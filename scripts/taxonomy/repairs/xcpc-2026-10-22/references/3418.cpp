#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n;cin>>n;vector<vector<double>>a(n,vector<double>(n));for(auto&r:a)for(auto&v:r)cin>>v;vector<double>dp(1<<n);dp.back()=1;for(int mask=(1<<n)-1;mask;mask--){int cnt=__builtin_popcount((unsigned)mask);if(cnt<=1)continue;double den=cnt*(cnt-1)/2.0;for(int j=0;j<n;j++)if(mask>>j&1){double kill=0;for(int i=0;i<n;i++)if((mask>>i&1)&&i!=j)kill+=a[i][j];dp[mask^(1<<j)]+=dp[mask]*kill/den;}}cout<<fixed<<setprecision(12);for(int i=0;i<n;i++)cout<<dp[1<<i]<<' ';cout<<'\n';}
