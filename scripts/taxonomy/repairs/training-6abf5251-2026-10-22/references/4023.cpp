#include <bits/stdc++.h>
using namespace std;

struct DSU{vector<int>p,s;DSU(int n):p(n),s(n,1){iota(p.begin(),p.end(),0);}int find(int x){while(p[x]!=x){p[x]=p[p[x]];x=p[x];}return x;}bool join(int a,int b){a=find(a);b=find(b);if(a==b)return false;if(s[a]<s[b])swap(a,b);p[b]=a;s[a]+=s[b];return true;}};

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;vector<tuple<long long,int,int>>edges;while(m--){int a,b;long long w;cin>>a>>b>>w;edges.push_back({w,a-1,b-1});}sort(edges.begin(),edges.end());DSU d(n);vector<pair<int,int>>answer;for(auto[w,a,b]:edges)if(d.join(a,b))answer.push_back(minmax(a+1,b+1));sort(answer.begin(),answer.end());for(auto[a,b]:answer)cout<<a<<" "<<b<<"\n";

return 0;
}
