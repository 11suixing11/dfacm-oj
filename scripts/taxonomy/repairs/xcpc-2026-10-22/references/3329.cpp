#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
int main(){int n;cin>>n;vector<bitset<2001>>dp(n+1);vector<int>last(2001,-1);for(int i=1;i<=n;i++){string op;int x;cin>>op>>x;dp[i]=dp[i-1];if(op=="win")last[x]=i;else if(last[x]>=0){auto candidate=dp[last[x]-1];candidate.set(x);for(int b=2000;b>=0;b--)if(candidate[b]!=dp[i][b]){if(candidate[b])dp[i]=candidate;break;}}}vector<int>decimal(1);for(int b=2000;b>=0;b--){int carry=dp[n][b];for(auto&digit:decimal){int value=digit*2+carry;digit=value%10;carry=value/10;}if(carry)decimal.push_back(carry);}for(auto it=decimal.rbegin();it!=decimal.rend();it++)cout<<*it;cout<<'\n';}
