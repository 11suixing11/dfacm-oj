#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<vector<int>>g(n);vector<int>degree(n);for(int i=0;i<n;i++){int v;while(cin>>v&&v){g[i].push_back(v-1);degree[v-1]++;}}priority_queue<int,vector<int>,greater<int>>q;for(int i=0;i<n;i++)if(!degree[i])q.push(i);bool first=true;while(!q.empty()){int u=q.top();q.pop();cout<<(first?"":" ")<<u+1;first=false;for(int v:g[u])if(--degree[v]==0)q.push(v);}cout<<"\n";

return 0;
}
