#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,p;cin>>n>>p;vector<int>to(n,-1),weight(n),indeg(n);for(int i=0,u,v,d;i<p;i++){cin>>u>>v>>d;--u;--v;to[u]=v;weight[u]=d;indeg[v]++;}vector<array<int,3>>answer;for(int start=0;start<n;start++)if(!indeg[start]&&to[start]>=0){int u=start,minimum=INT_MAX;while(to[u]>=0){minimum=min(minimum,weight[u]);u=to[u];}answer.push_back({start+1,u+1,minimum});}cout<<answer.size()<<'\n';for(auto&a:answer)cout<<a[0]<<' '<<a[1]<<' '<<a[2]<<'\n';}
