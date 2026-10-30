#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;vector<int>f(n),d(n),t(max(0,n-1));for(int&x:f)cin>>x;for(int&x:d)cin>>x;for(int&x:t)cin>>x;int T;cin>>T;long long best=0;int spent=0;for(int last=0;last<n;last++){if(last)spent+=t[last-1];int remaining=T-spent;if(remaining<=0)continue;priority_queue<pair<int,int>>q;for(int i=0;i<=last;i++)q.push({f[i],i});long long answer=0;while(remaining--){auto[x,i]=q.top();q.pop();answer+=x;q.push({max(0,x-d[i]),i});}best=max(best,answer);}cout<<best<<"\n";

return 0;
}
