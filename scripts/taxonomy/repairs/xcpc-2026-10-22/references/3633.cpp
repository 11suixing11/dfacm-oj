#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){string s,a,b;cin>>s>>a>>b;int n=s.size();vector<int>sa(n);iota(sa.begin(),sa.end(),0);sort(sa.begin(),sa.end(),[&](int i,int j){return s.compare(i,n-i,s,j,n-j)<0;});vector<int>end(n+1);for(int i=0;i+(int)b.size()<=n;i++)if(s.compare(i,b.size(),b)==0)end[i+b.size()]++;for(int i=n-1;i>=0;i--)end[i]+=end[i+1];ll ans=0;for(int p=0;p<n;p++){int i=sa[p];if(s.compare(i,a.size(),a))continue;int lcp=0;if(p)while(i+lcp<n&&sa[p-1]+lcp<n&&s[i+lcp]==s[sa[p-1]+lcp])lcp++;int minlen=max({(int)a.size(),(int)b.size(),lcp+1});if(i+minlen<=n)ans+=end[i+minlen];}cout<<ans<<'\n';}
