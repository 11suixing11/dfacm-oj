#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,k;cin>>n>>k;vector<int>t(n),d(n);for(int i=0;i<n;i++)cin>>t[i]>>d[i];const int INF=1000000000;vector<int>dp(k+1,INF);dp[0]=1;int ans=0;for(int i=0;i<=n;i++){for(int j=0;j<=min(k,i);j++)if(dp[j]<INF){int next=min(n,i+k-j),end=next==n?86401:t[next];ans=max(ans,end-dp[j]);}if(i==n)break;vector<int>ndp(k+1,INF);for(int j=0;j<=min(i,k);j++)if(dp[j]<INF){ndp[j]=min(ndp[j],max(dp[j],t[i])+d[i]);if(j<k)ndp[j+1]=min(ndp[j+1],dp[j]);}dp.swap(ndp);}cout<<ans<<'\n';}
