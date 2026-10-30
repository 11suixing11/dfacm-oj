#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n>>m;map<int,vector<int>>children;set<int>nodes,nonroots;for(int i=0;i<m;i++){int a,b;cin>>a>>b;nodes.insert(a);nodes.insert(b);nonroots.insert(b);children[a].push_back(b);}if(n==1)nodes.insert(1);int root=0,best=*nodes.begin();for(int x:nodes){if(!nonroots.count(x))root=x;if(children[x].size()>children[best].size())best=x;}sort(children[best].begin(),children[best].end());cout<<root<<"\n"<<best<<"\n";for(size_t i=0;i<children[best].size();i++)cout<<(i?" ":"")<<children[best][i];cout<<"\n";

return 0;
}
