#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,k;string s;cin>>n>>k>>s;vector<int>freq(10);for(char c:s)freq[c-'0']++;int best=INT_MAX;string answer;for(int target=0;target<10;target++){string t=s;int need=max(0,k-freq[target]),cost=0;for(int delta=1;delta<10&&need;delta++){if(target+delta<10)for(int i=0;i<n&&need;i++)if(s[i]-'0'==target+delta){t[i]='0'+target;need--;cost+=delta;}if(target-delta>=0)for(int i=n-1;i>=0&&need;i--)if(s[i]-'0'==target-delta){t[i]='0'+target;need--;cost+=delta;}}if(cost<best||(cost==best&&t<answer)){best=cost;answer=t;}}cout<<best<<'\n'<<answer<<'\n';}
