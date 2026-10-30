#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int w,b;cin>>w>>b;vector<vector<long double>>dp(w+1,vector<long double>(b+1));for(int i=1;i<=w;i++)for(int j=0;j<=b;j++){long double t=i+j;dp[i][j]=i/t;if(j>=2&&t>2){long double after=i/(t-2)*dp[i-1][j-2];if(j>=3)after+=(j-2)/(t-2)*dp[i][j-3];dp[i][j]+=j/t*(j-1)/(t-1)*after;}}cout<<fixed<<setprecision(15)<<dp[w][b]<<'\n';}
