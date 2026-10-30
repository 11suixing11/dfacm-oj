#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int t;cin>>t;while(t--){string a,b;cin>>a>>b;int n=a.size(),m=b.size(),N=n+1,M=m+1;vector<unsigned char>dp((size_t)N*N*M*M);auto at=[&](int l,int r,int x,int y)->unsigned char&{return dp[((l*N+r)*M+x)*M+y];};int answer=0;for(int la=0;la<=n;la++)for(int lb=0;lb<=m;lb++)for(int l=0;l+la<=n;l++)for(int x=0;x+lb<=m;x++){int r=l+la,y=x+lb;bool good=la+lb<=1;if(la>=2&&a[l]==a[r-1]&&at(l+1,r-1,x,y))good=true;if(lb>=2&&b[x]==b[y-1]&&at(l,r,x+1,y-1))good=true;if(la&&lb&&a[l]==b[y-1]&&at(l+1,r,x,y-1))good=true;if(la&&lb&&b[x]==a[r-1]&&at(l,r-1,x+1,y))good=true;at(l,r,x,y)=good;if(good)answer=max(answer,la+lb);}cout<<answer<<'\n';}}
