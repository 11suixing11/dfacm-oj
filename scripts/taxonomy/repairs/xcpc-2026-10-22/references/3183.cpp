#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,m,v;cin>>n>>m>>v;ll maxm=1LL*(n-1)*(n-2)/2+1;if(m<n-1||m>maxm){cout<<-1<<'\n';return 0;}int leaf=v==1?2:1;vector<int>a;for(int i=1;i<=n;i++)if(i!=leaf)a.push_back(i);cout<<leaf<<' '<<v<<'\n';int left=m-1;for(int x:a)if(x!=v){cout<<v<<' '<<x<<'\n';left--;}for(int i=0;i<(int)a.size()&&left;i++)for(int j=i+1;j<(int)a.size()&&left;j++)if(a[i]!=v&&a[j]!=v){cout<<a[i]<<' '<<a[j]<<'\n';left--;}}
