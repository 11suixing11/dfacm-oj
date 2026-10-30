#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n;cin>>n;vector<ll>a(n-1);for(auto&v:a)cin>>v;const ll bad=-4000000000000000000LL;array<ll,3>dp={bad,bad,bad};ll ans=0;for(ll v:a){ll even=v-v%2,odd=v%2?v:v-1;array<ll,3>next={bad,bad,bad};if(even){next[0]=max(even,dp[0]+even);next[2]=max({dp[1]+even,dp[2]+even});}next[1]=max({odd,dp[0]+odd,dp[1]+odd});dp=next;for(ll value:dp)ans=max(ans,value);}cout<<ans<<'\n';}
