#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){string s;int n;cin>>s>>n;const int INF=10000;vector<array<int,2>>lo(n+1,{INF,INF}),hi(n+1,{-INF,-INF});lo[0][0]=hi[0][0]=0;for(char c:s){vector<array<int,2>>a(n+1,{INF,INF}),b(n+1,{-INF,-INF});for(int k=0;k<=n;k++)for(int d=0;d<2;d++)if(lo[k][d]<INF)for(int flip=0;flip<2&&k+flip<=n;flip++){char cmd=flip?(c=='F'?'T':'F'):c;int nd=d^(cmd=='T'),move=cmd=='F'?(d?-1:1):0;a[k+flip][nd]=min(a[k+flip][nd],lo[k][d]+move);b[k+flip][nd]=max(b[k+flip][nd],hi[k][d]+move);}lo.swap(a);hi.swap(b);}int ans=0;for(int k=n%2;k<=n;k+=2)for(int d=0;d<2;d++)if(lo[k][d]<INF)ans=max({ans,abs(lo[k][d]),abs(hi[k][d])});cout<<ans<<'\n';}
