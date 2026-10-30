#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int t,k;cin>>t>>k;const int n=2000;vector<vector<int>>c(n+1,vector<int>(n+1)),p=c;for(int i=0;i<=n;i++){c[i][0]=1;for(int j=1;j<=i;j++)c[i][j]=(c[i-1][j-1]+c[i-1][j])%k;}for(int i=1;i<=n;i++)for(int j=1;j<=n;j++)p[i][j]=p[i-1][j]+p[i][j-1]-p[i-1][j-1]+(j<=i&&c[i][j]==0);while(t--){int a,b;cin>>a>>b;cout<<p[a][b]<<'\n';}}
