#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<vector<int>>g(n);for(int i=0;i<n;i++){int count;cin>>count;while(count--){int v;cin>>v;g[i].push_back(v-1);}}DSU d(n);vector<bool>active(n);int largest=0,answer=0;for(int u=n-1;u>=0;u--){active[u]=true;largest=max(largest,1);for(int v:g[u])if(active[v]){d.join(u,v);largest=max(largest,d.s[d.find(u)]);}if(largest>n/2){answer=u+1;break;}}cout<<answer<<"\n";

return 0;
}
