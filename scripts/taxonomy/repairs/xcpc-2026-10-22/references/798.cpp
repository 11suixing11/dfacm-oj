#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n;cin>>n;const int mod=23333333;vector<int>p(n+1);p[0]=1;for(int v=1;v<=n;v++){ll sum=0;for(int j=1;;j++){int a=j*(3*j-1)/2,b=j*(3*j+1)/2;if(a>v)break;int sign=j%2?1:-1;sum+=sign*p[v-a];if(b<=v)sum+=sign*p[v-b];}p[v]=(sum%mod+mod)%mod;}for(int i=1;i*(i+1)<=n;i++){int step=i*(i+1);for(int v=n;v>=step;v--){p[v]-=p[v-step];if(p[v]<0)p[v]+=mod;}}cout<<p[n]<<'\n';}
