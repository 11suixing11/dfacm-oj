#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,l,k;cin>>n>>l>>k;vector<int>p(n),a(n);for(auto&v:p)cin>>v;for(auto&v:a)cin>>v;vector<int>order(n);iota(order.begin(),order.end(),0);sort(order.begin(),order.end(),[&](int x,int y){return a[x]>a[y];});vector<vector<double>>dp(n+1,vector<double>(n+1));dp[0][min(k,n)]=1;int done=0;for(int i:order){vector<vector<double>>ndp(n+1,vector<double>(n+1));double pr=p[i]/100.0;for(int wins=0;wins<=done;wins++)for(int cap=0;cap<=n;cap++)if(dp[wins][cap]){ndp[wins][cap]+=dp[wins][cap]*(1-pr);if(cap+a[i]>=0)ndp[wins+1][min(n,cap+a[i])]+=dp[wins][cap]*pr;}dp.swap(ndp);done++;}double ans=0;for(int w=l;w<=n;w++)for(double v:dp[w])ans+=v;cout<<fixed<<setprecision(15)<<ans<<'\n';}
