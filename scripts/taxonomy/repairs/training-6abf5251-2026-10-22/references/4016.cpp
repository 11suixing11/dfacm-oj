#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;vector<vector<pair<int,int>>>graph(n+1);for(int i=0;i<m;i++){int a,b;cin>>a>>b;graph[a].push_back({b,i});graph[b].push_back({a,i});}int start=1;while(graph[start].empty())start++;for(int i=1;i<=n;i++)if(graph[i].size()%2){start=i;break;}vector<int>position(n+1),stack{start},path;vector<bool>used(m);while(!stack.empty()){int u=stack.back();while(position[u]<(int)graph[u].size()&&used[graph[u][position[u]].second])position[u]++;if(position[u]==(int)graph[u].size()){path.push_back(u);stack.pop_back();}else{auto[v,id]=graph[u][position[u]++];used[id]=true;stack.push_back(v);}}reverse(path.begin(),path.end());for(size_t i=0;i<path.size();i++)cout<<(i?" ":"")<<path[i];cout<<"\n";

return 0;
}
