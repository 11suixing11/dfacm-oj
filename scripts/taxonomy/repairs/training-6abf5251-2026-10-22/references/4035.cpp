#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,a,b;cin>>n>>a>>b;vector<int>step(n+1),d(n+1,-1);for(int i=1;i<=n;i++)cin>>step[i];queue<int>q;q.push(a);d[a]=0;while(!q.empty()){int u=q.front();q.pop();for(int v:{u-step[u],u+step[u]})if(v>=1&&v<=n&&d[v]<0){d[v]=d[u]+1;q.push(v);}}cout<<d[b]<<"\n";

return 0;
}
