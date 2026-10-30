#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,s;cin>>n>>s;priority_queue<pair<int,int>>q;ll sum=0;for(int i=1,d;i<=n;i++){cin>>d;sum+=d;if(d)q.push({d,i});}vector<pair<int,int>>edges;if(sum!=s||s%2){cout<<"No\n";return 0;}while(!q.empty()){auto[d,u]=q.top();q.pop();if(d>(int)q.size()){cout<<"No\n";return 0;}vector<pair<int,int>>next;for(int i=0;i<d;i++){auto[e,v]=q.top();q.pop();edges.push_back({u,v});if(e>1)next.push_back({e-1,v});}for(auto item:next)q.push(item);}cout<<"Yes\n"<<edges.size()<<'\n';for(auto[u,v]:edges)cout<<u<<' '<<v<<'\n';}
