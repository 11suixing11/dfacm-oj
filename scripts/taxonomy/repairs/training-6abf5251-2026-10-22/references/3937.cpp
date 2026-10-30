#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>a(n),d(n);vector<vector<int>>edge(n);vector<int>next(n,-1);for(auto&x:a)cin>>x;int u,v;while(cin>>u>>v&&(u||v))edge[u-1].push_back(v-1);for(int i=n-1;i>=0;i--){d[i]=a[i];sort(edge[i].begin(),edge[i].end());if(!edge[i].empty()){int best=edge[i][0];for(int j:edge[i])if(d[j]>d[best])best=j;d[i]+=d[best];next[i]=best;}}int s=max_element(d.begin(),d.end())-d.begin();cout<<s+1;for(int u=next[s];u>=0;u=next[u])cout<<'-'<<u+1;cout<<"\n"<<d[s]<<"\n";}
