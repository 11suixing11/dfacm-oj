#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
ll dp[21][4][2][11][11];int main(){int n,t;cin>>n>>t;for(int a=0;a<4;a++)for(int b=0;b<4;b++)if(a!=b)dp[2][b][b>a][0][0]++;for(int len=2;len<n;len++)for(int h=0;h<4;h++)for(int d=0;d<2;d++)for(int p=0;p<=t;p++)for(int v=0;v<t;v++)if(dp[len][h][d][p][v])for(int next=0;next<4;next++)if(next!=h){int nd=next>h,np=p+(d&&!nd),nv=v+(!d&&nd);if(np<=t&&nv<t)dp[len+1][next][nd][np][nv]+=dp[len][h][d][p][v];}ll ans=0;for(int h=0;h<4;h++)for(int d=0;d<2;d++)ans+=dp[n][h][d][t][t-1];cout<<ans<<'\n';}
