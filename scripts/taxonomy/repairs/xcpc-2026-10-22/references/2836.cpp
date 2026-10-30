#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;cin>>n;vector<ll>a(n),p(n+1);for(int i=0;i<n;i++){cin>>a[i];p[i+1]=p[i]+max(0LL,a[i]);}map<ll,pair<ll,int>>best;ll ans=LLONG_MIN;int l=0,r=1;for(int j=0;j<n;j++){ll v=a[j];if(best.count(v)){auto[val,i]=best[v];ll cur=2*v+p[j]-p[i+1];if(cur>ans){ans=cur;l=i;r=j;}}ll key=p[j+1];if(!best.count(v)||key<best[v].first)best[v]={key,j};}vector<int>cut;for(int i=0;i<n;i++)if(i<l||i>r||(i>l&&i<r&&a[i]<0))cut.push_back(i+1);cout<<ans<<' '<<cut.size()<<'\n';for(int v:cut)cout<<v<<' ';cout<<'\n';}
