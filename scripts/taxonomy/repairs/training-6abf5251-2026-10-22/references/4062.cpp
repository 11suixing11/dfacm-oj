#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m,budget;cin>>n>>m>>budget;vector<long long>price(n),value(n);for(int i=0;i<n;i++)cin>>price[i]>>value[i];DSU d(n);while(m--){int a,b;cin>>a>>b;d.join(a-1,b-1);}vector<long long>p(n),v(n);for(int i=0;i<n;i++){int r=d.find(i);p[r]+=price[i];v[r]+=value[i];}vector<long long>dp(budget+1);for(int i=0;i<n;i++)if(d.find(i)==i&&p[i]<=budget)for(int x=budget;x>=p[i];x--)dp[x]=max(dp[x],dp[x-p[i]]+v[i]);cout<<dp[budget]<<"\n";

return 0;
}
