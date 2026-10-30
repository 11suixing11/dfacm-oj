#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;DSU d(n);long long cost=0;vector<tuple<long long,int,int>>edges;while(m--){int p,a,b;long long w;cin>>p>>a>>b>>w;if(p==1){cost+=w;d.join(a-1,b-1);}else edges.push_back({w,a-1,b-1});}sort(edges.begin(),edges.end());for(auto[w,a,b]:edges)if(d.join(a,b))cost+=w;cout<<cost<<"\n";

return 0;
}
