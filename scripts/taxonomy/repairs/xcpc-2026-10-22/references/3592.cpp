#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);string s;cin>>s;int n=s.size();DSU d(n+1);vector<int>prime(n+1,1);for(int p=2;p<=n;p++)if(prime[p])for(int v=2*p;v<=n;v+=p){prime[v]=0;d.join(p,v);}map<int,vector<int>> groups;for(int i=1;i<=n;i++)groups[d.find(i)].push_back(i);vector<vector<int>>gs;for(auto &g:groups)gs.push_back(g.second);sort(gs.begin(),gs.end(),[](auto&a,auto&b){return a.size()>b.size();});array<int,26>freq{};for(char c:s)freq[c-'a']++;string ans(n,'?');for(auto&g:gs){int c=max_element(freq.begin(),freq.end())-freq.begin();if(freq[c]<(int)g.size()){cout<<"NO\n";return 0;}for(int i:g)ans[i-1]='a'+c;freq[c]-=g.size();}cout<<"YES\n"<<ans<<'\n';}
