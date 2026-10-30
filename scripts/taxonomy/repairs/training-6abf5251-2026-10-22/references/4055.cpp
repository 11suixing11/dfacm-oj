#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,p,c;long long m;cin>>n>>p>>c>>m;vector<vector<int>>g(n);while(p--){int a,b;cin>>a>>b;g[a-1].push_back(b-1);g[b-1].push_back(a-1);}vector<int>d(n,-1);queue<int>q;q.push(c-1);d[c-1]=0;while(!q.empty()){int u=q.front();q.pop();for(int v:g[u])if(d[v]<0){d[v]=d[u]+1;q.push(v);}}cout<<*max_element(d.begin(),d.end())+m+1<<"\n";

return 0;
}
