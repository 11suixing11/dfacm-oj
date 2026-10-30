#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;cin>>n;vector<ll>a(n+1);for(int i=2;i<=n;i++)cin>>a[i];int N=2*(n+1);vector<int>state(N);vector<ll>dp(N);for(int start=4;start<N;start++){if(state[start])continue;vector<int>path;int u=start;ll result=0;while(true){int x=u/2,dir=u%2;if(x<=0||x>n){result=0;break;}if(x==1){result=-1;break;}if(state[u]==2){result=dp[u];break;}if(state[u]==1){result=-1;break;}state[u]=1;path.push_back(u);ll next=x+(dir?-a[x]:a[x]);if(next<=0||next>n){result=0;break;}u=2*next+!dir;}while(!path.empty()){int v=path.back();path.pop_back();if(result>=0)result+=a[v/2];dp[v]=result;state[v]=2;}}for(int i=1;i<n;i++){ll v=dp[2*(i+1)+1];cout<<(v<0?-1:v+i)<<'\n';}}
