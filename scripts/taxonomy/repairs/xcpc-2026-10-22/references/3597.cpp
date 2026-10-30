#include <bits/stdc++.h>
using namespace std;
using ll=long long;
struct DSU{vector<int>p,sz;DSU(int n):p(n),sz(n,1){iota(p.begin(),p.end(),0);}int find(int x){return p[x]==x?x:p[x]=find(p[x]);}void join(int a,int b){a=find(a);b=find(b);if(a!=b){if(sz[a]<sz[b])swap(a,b);p[b]=a;sz[a]+=sz[b];}}};
struct BIT{int n;vector<int>t;BIT(int n=0):n(n),t(n+1){}void add(int x,int v){for(++x;x<=n;x+=x&-x)t[x]+=v;}int sum(int x){int r=0;for(;x>0;x-=x&-x)r+=t[x];return r;}int kth(int k){int p=0;for(int step=1<<20;step;step>>=1)if(p+step<=n&&t[p+step]<k){p+=step;k-=t[p];}return p;}};
ll power(ll a,ll b,ll mod=1000000007){ll r=1;for(;b;b>>=1,a=a*a%mod)if(b&1)r=r*a%mod;return r;}
bool lucky(ll x){if(!x)return false;for(;x;x/=10)if(x%10!=4&&x%10!=7)return false;return true;}int main(){ll n,k;cin>>n>>k;int len=min(n,13LL);vector<ll>fact(len+1,1);for(int i=1;i<=len;i++)fact[i]=fact[i-1]*i;if(k>fact[len]){cout<<-1<<'\n';return 0;}ll base=n-len;vector<ll>values;for(int i=1;i<=len;i++)values.push_back(base+i);ll ans=0;function<void(ll)>gen=[&](ll x){if(x>base)return;if(x)ans++;if(x*10+4<=base)gen(x*10+4);if(x*10+7<=base)gen(x*10+7);};gen(0);k--;for(int i=0;i<len;i++){ll index=k/fact[len-i-1];k%=fact[len-i-1];ll value=values[index];values.erase(values.begin()+index);ans+=lucky(base+i+1)&&lucky(value);}cout<<ans<<'\n';}
