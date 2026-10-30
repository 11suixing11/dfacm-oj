#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int l,r;cin>>l>>r;int root=sqrt(r);vector<bool>small(root+1);vector<int>primes;for(int p=2;p<=root;p++)if(!small[p]){primes.push_back(p);for(ll j=1LL*p*p;j<=root;j+=p)small[j]=true;}int answer=l<=2&&2<=r;const int block=1000000;for(int lo=max(l,3);lo<=r;lo+=block){int hi=min(r,lo+block-1);vector<bool>composite(hi-lo+1);for(int p:primes){ll start=max(1LL*p*p,(lo+p-1LL)/p*p);for(ll j=start;j<=hi;j+=p)composite[j-lo]=true;}for(int x=lo;x<=hi;x++)if(x%4==1&&!composite[x-lo])answer++;}cout<<answer<<'\n';}
