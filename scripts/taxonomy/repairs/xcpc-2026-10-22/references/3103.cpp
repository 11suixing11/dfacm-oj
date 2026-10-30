#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n;cin>>n;vector<int>a(n);for(auto&v:a){cin>>v;v++;}int r1,c1,r2,c2;cin>>r1>>c1>>r2>>c2;--r1;--r2;int ans=INT_MAX;for(int l=0;l<=min(r1,r2);l++)for(int r=max(r1,r2);r<n;r++){int mi=*min_element(a.begin()+l,a.begin()+r+1);int vertical=min(abs(r1-l)+r-l+abs(r-r2),abs(r-r1)+r-l+abs(r2-l));int horizontal=abs(c2-min(mi,c1));ans=min(ans,vertical+horizontal);}cout<<ans<<'\n';}
