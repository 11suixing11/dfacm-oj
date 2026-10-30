#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){ios::sync_with_stdio(false);cin.tie(nullptr);int k;string s;cin>>k>>s;string t;for(int i=0;i<k;i++)t+=s;vector<vector<int>>pos(26);for(int i=0;i<(int)t.size();i++)pos[t[i]-'a'].push_back(i);vector<BIT>bits;for(auto&v:pos){bits.emplace_back(v.size());for(int i=0;i<(int)v.size();i++)bits.back().add(i,1);}int n;cin>>n;vector<bool>del(t.size());while(n--){int p;char c;cin>>p>>c;int x=c-'a',i=bits[x].kth(p);del[pos[x][i]]=true;bits[x].add(i,-1);}for(int i=0;i<(int)t.size();i++)if(!del[i])cout<<t[i];cout<<'\n';}
