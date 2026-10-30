#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){const int mod=1000000007;vector<vector<int>>dp(101,vector<int>(2501));dp[0][0]=1;for(int len=1;len<=100;len++){ll sum=0;for(int weight=0;weight<=25*len;weight++){sum+=dp[len-1][weight];if(weight>=26)sum-=dp[len-1][weight-26];sum=(sum%mod+mod)%mod;dp[len][weight]=sum;}}int t;cin>>t;while(t--){string s;cin>>s;int sum=0;for(char c:s)sum+=c-'a';cout<<(dp[s.size()][sum]+mod-1)%mod<<'\n';}}
