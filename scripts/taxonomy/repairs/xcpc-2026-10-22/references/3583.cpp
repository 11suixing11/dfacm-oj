#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ll t1,t2,x1,x2,t0;cin>>t1>>t2>>x1>>x2>>t0;if(t1==t2){cout<<x1<<' '<<x2<<'\n';return 0;}if(t0==t1){cout<<x1<<" 0\n";return 0;}if(t0==t2){cout<<"0 "<<x2<<'\n';return 0;}ll cold=t0-t1,hot=t2-t0,b1=0,b2=x2,bnum=hot*x2,bden=x2;for(ll y2=1;y2<=x2;y2++){ll y1=min(x1,hot*y2/cold),num=hot*y2-cold*y1,den=y1+y2;__int128 a=(__int128)num*bden,b=(__int128)bnum*den;if(a<b||(a==b&&den>bden)){bnum=num;bden=den;b1=y1;b2=y2;}}cout<<b1<<' '<<b2<<'\n';}
