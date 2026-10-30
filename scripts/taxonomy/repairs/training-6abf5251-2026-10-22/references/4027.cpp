#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;vector<vector<int>>g(n);vector<int>degree(n),bonus(n,100);while(m--){int a,b;cin>>a>>b;g[b-1].push_back(a-1);degree[a-1]++;}queue<int>q;for(int i=0;i<n;i++)if(!degree[i])q.push(i);int count=0;while(!q.empty()){int u=q.front();q.pop();count++;for(int v:g[u]){bonus[v]=max(bonus[v],bonus[u]+1);if(--degree[v]==0)q.push(v);}}if(count<n)cout<<"Poor Xed\n";else cout<<accumulate(bonus.begin(),bonus.end(),0LL)<<"\n";

return 0;
}
