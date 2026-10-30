#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){string s,t;cin>>s>>t;int n=s.size(),m=t.size();vector<int>pre(n),suf(n);int j=0;for(int i=0;i<n;i++){pre[i]=j;if(j<m&&s[i]==t[j])j++;}if(j<m){cout<<"No\n";return 0;}j=m-1;for(int i=n-1;i>=0;i--){suf[i]=j;if(j>=0&&s[i]==t[j])j--;}vector<vector<int>>pos(26);for(int i=0;i<m;i++)pos[t[i]-'a'].push_back(i);for(int i=0;i<n;i++){int lo=max(0,suf[i]),hi=min(m-1,pre[i]);auto&v=pos[s[i]-'a'];auto it=lower_bound(v.begin(),v.end(),lo);if(it==v.end()||*it>hi){cout<<"No\n";return 0;}}cout<<"Yes\n";}
