#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n,m;cin>>n>>m;vector<int>row(n,-1),col(m,-1);bool good=true;int horizontal[4]={0,0,1,1},vertical[4]={0,1,1,0};for(int i=0;i<n;i++){string s;cin>>s;for(int j=0;j<m;j++)if(s[j]!='.'){int type=s[j]-'1',r=horizontal[type]^(j%2),c=vertical[type]^(i%2);if(row[i]>=0&&row[i]!=r)good=false;if(col[j]>=0&&col[j]!=c)good=false;row[i]=r;col[j]=c;}}int free=count(row.begin(),row.end(),-1)+count(col.begin(),col.end(),-1);cout<<(good?power(2,free,1000003):0)<<'\n';}
