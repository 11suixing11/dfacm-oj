#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ll x0,y0,x1,y1;cin>>x0>>y0>>x1>>y1;int n;cin>>n;set<pair<ll,ll>>allowed;for(int i=0;i<n;i++){ll r,a,b;cin>>r>>a>>b;for(ll j=a;j<=b;j++)allowed.insert({r,j});}queue<tuple<ll,ll,int>>q;q.push({x0,y0,0});allowed.erase({x0,y0});while(!q.empty()){auto[x,y,d]=q.front();q.pop();if(x==x1&&y==y1){cout<<d<<'\n';return 0;}for(int dx=-1;dx<=1;dx++)for(int dy=-1;dy<=1;dy++)if(dx||dy){auto p=make_pair(x+dx,y+dy);if(allowed.erase(p))q.push({p.first,p.second,d+1});}}cout<<-1<<'\n';}
