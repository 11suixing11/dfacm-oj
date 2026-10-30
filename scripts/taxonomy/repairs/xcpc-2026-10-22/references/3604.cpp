#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,m;cin>>n>>m;vector<ll>r(n),c(m);for(int i=0;i<n;i++)for(int j=0;j<m;j++){int v;cin>>v;r[i]+=v;c[j]+=v;}vector<ll>a(3);for(auto&v:a)cin>>v;sort(a.begin(),a.end());ll ans=0;for(auto v:{r,c}){vector<ll>p(v.size()+1);partial_sum(v.begin(),v.end(),p.begin()+1);for(int i=1;i<(int)v.size();i++)for(int j=i+1;j<(int)v.size();j++){vector<ll>x={p[i],p[j]-p[i],p.back()-p[j]};sort(x.begin(),x.end());ans+=x==a;}}cout<<ans<<'\n';}
