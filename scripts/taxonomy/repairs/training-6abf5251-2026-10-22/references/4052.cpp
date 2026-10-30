#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int m,n;cin>>m>>n;string line;getline(cin,line);vector<vector<int>>g(n);for(int i=0;i<m;i++){getline(cin,line);istringstream in(line);vector<int>a;int x;while(in>>x)a.push_back(x-1);for(size_t j=0;j<a.size();j++)for(size_t k=j+1;k<a.size();k++)g[a[j]].push_back(a[k]);}vector<int>d(n,-1);queue<int>q;q.push(0);d[0]=0;while(!q.empty()){int u=q.front();q.pop();for(int v:g[u])if(d[v]<0){d[v]=d[u]+1;q.push(v);}}if(d[n-1]<0)cout<<"NO\n";else cout<<max(0,d[n-1]-1)<<"\n";

return 0;
}
