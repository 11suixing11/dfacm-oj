#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int m;cin>>m;vector<multiset<pair<int,int>>>g(501);vector<int>degree(501);for(int i=0;i<m;i++){int a,b;cin>>a>>b;g[a].insert({b,i});g[b].insert({a,i});degree[a]++;degree[b]++;}int start=1;while(!degree[start])start++;for(int i=1;i<=500;i++)if(degree[i]%2){start=i;break;}vector<bool>used(m);vector<int>stack{start},path;while(!stack.empty()){int u=stack.back();while(!g[u].empty()&&used[g[u].begin()->second])g[u].erase(g[u].begin());if(g[u].empty()){path.push_back(u);stack.pop_back();}else{auto[v,id]=*g[u].begin();g[u].erase(g[u].begin());used[id]=true;stack.push_back(v);}}reverse(path.begin(),path.end());for(int x:path)cout<<x<<"\n";

return 0;
}
