#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
using ull=unsigned long long;using u128=__uint128_t;const ull MOD=7528443412579576937ULL;struct Mat{ull a[2][2];};Mat mul(Mat x,Mat y){Mat z{};for(int i=0;i<2;i++)for(int j=0;j<2;j++)for(int k=0;k<2;k++)z.a[i][j]=(z.a[i][j]+(u128)x.a[i][k]*y.a[k][j])%MOD;return z;}int main(){ull b,d,n;cin>>b>>d>>n;if(!n){cout<<1<<'\n';return 0;}ull c=(d-b*b)/4;Mat a={{{b%MOD,c%MOD},{1,0}}},r={{{1,0},{0,1}}};ull exp=n-1;for(;exp;exp>>=1,a=mul(a,a))if(exp&1)r=mul(r,a);ull value=((u128)r.a[0][0]*b+(u128)r.a[0][1]*2)%MOD;if(d>b*b&&n%2==0)value=(value+MOD-1)%MOD;cout<<value<<'\n';}
