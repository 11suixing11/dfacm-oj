#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<long long>population(n);vector<vector<int>>graph(n);for(int i=0;i<n;i++){int a,b;cin>>population[i]>>a>>b;for(int x:{a,b})if(x){graph[i].push_back(x-1);graph[x-1].push_back(i);}}long long answer=LLONG_MAX;for(int start=0;start<n;start++){vector<int>d(n,-1);d[start]=0;queue<int>q;q.push(start);long long sum=0;while(!q.empty()){int u=q.front();q.pop();sum+=population[u]*d[u];for(int v:graph[u])if(d[v]<0){d[v]=d[u]+1;q.push(v);}}answer=min(answer,sum);}cout<<answer<<"\n";

return 0;
}
