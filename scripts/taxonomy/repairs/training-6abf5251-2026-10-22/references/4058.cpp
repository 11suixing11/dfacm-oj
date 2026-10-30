#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<vector<int>>g(n);for(auto&row:g){int v;while(cin>>v&&v)row.push_back(v-1);}vector<int>num(n,-1),low(n),component(n,-1),stack;vector<bool>active(n);int clock=0,count=0;function<void(int)>dfs=[&](int u){num[u]=low[u]=clock++;stack.push_back(u);active[u]=true;for(int v:g[u])if(num[v]<0){dfs(v);low[u]=min(low[u],low[v]);}else if(active[v])low[u]=min(low[u],num[v]);if(low[u]==num[u]){while(true){int v=stack.back();stack.pop_back();active[v]=false;component[v]=count;if(v==u)break;}count++;}};for(int u=0;u<n;u++)if(num[u]<0)dfs(u);vector<bool>incoming(count);for(int u=0;u<n;u++)for(int v:g[u])if(component[u]!=component[v])incoming[component[v]]=true;cout<<std::count(incoming.begin(),incoming.end(),false)<<"\n";

return 0;
}
