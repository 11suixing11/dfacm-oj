#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){string s;cin>>s;int n=s.size(),ans=-1;auto val=[&](int l,int r){if(r-l>1&&s[l]=='0')return -1;if(r-l>7)return -1;ll v=0;for(int i=l;i<r;i++)v=v*10+s[i]-'0';return v<=1000000?(int)v:-1;};for(int i=1;i<n;i++)for(int j=i+1;j<n;j++){int a=val(0,i),b=val(i,j),c=val(j,n);if(min({a,b,c})>=0)ans=max(ans,a+b+c);}cout<<ans<<'\n';}
