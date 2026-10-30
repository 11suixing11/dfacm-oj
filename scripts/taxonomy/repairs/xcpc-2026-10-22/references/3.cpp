#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,h;cin>>n>>h;vector<array<int,3>>s(h);for(auto&a:s)cin>>a[0]>>a[1]>>a[2];sort(s.begin(),s.end(),[](auto&a,auto&b){return a[1]<b[1];});BIT bit(n+1);vector<int>parent(n+1);iota(parent.begin(),parent.end(),0);auto find=[&](int x){int root=x;while(parent[root]!=root)root=parent[root];while(x!=root){int next=parent[x];parent[x]=root;x=next;}return root;};int ans=0;for(auto[a,b,t]:s){int need=t-(bit.sum(b+1)-bit.sum(a));for(int p=find(b);need>0;p=find(p)){bit.add(p,1);parent[p]=find(p-1);ans++;need--;}}cout<<ans<<'\n';}
