#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){vector<string>a(8);for(auto&s:a)cin>>s;set<pair<int,int>>cur={{7,0}};auto blocked=[&](int r,int c,int t){return r-t>=0&&a[r-t][c]=='S';};for(int t=0;t<=8;t++){set<pair<int,int>>next;for(auto[r,c]:cur){if(blocked(r,c,t))continue;if(r==0&&c==7){cout<<"WIN\n";return 0;}for(int dr=-1;dr<=1;dr++)for(int dc=-1;dc<=1;dc++){int x=r+dr,y=c+dc;if(x<0||x>=8||y<0||y>=8||blocked(x,y,t)||blocked(x,y,t+1))continue;next.insert({x,y});}}cur=next;if(t==8&&!cur.empty()){cout<<"WIN\n";return 0;}}cout<<"LOSE\n";}
