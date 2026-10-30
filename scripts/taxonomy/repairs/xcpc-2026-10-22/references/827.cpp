#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ll n;cin>>n;ll s=sqrt((long double)n);while((s+1)*(s+1)<=n)s++;while(s*s>n)s--;vector<ll>v,g;vector<int>small(s+1),large(s+1);for(ll l=1;l<=n;){ll x=n/l;int id=v.size();v.push_back(x);g.push_back(x-1);if(x<=s)small[x]=id;else large[n/x]=id;l=n/x+1;}auto id=[&](ll x){return x<=s?small[x]:large[n/x];};for(ll p=2;p<=s;p++)if(g[id(p)]>g[id(p-1)]){ll count=g[id(p-1)],sq=p*p;for(int i=0;i<(int)v.size()&&v[i]>=sq;i++)g[i]-=g[id(v[i]/p)]-count;}cout<<g[0]<<'\n';}
