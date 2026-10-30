#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n,m;cin>>n;vector<int>a(n);for(int&x:a)cin>>x;cin>>m;vector<int>b(m);for(int&x:b)cin>>x;
struct Node{int value,parent;};vector<Node>nodes;vector<int>d(m),last(m,-1);
for(int x:a){int length=0,parent=-1;for(int j=0;j<m;j++){if(b[j]<x&&d[j]>length){length=d[j];parent=last[j];}else if(b[j]==x&&length+1>d[j]){d[j]=length+1;nodes.push_back({x,parent});last[j]=nodes.size()-1;}}}
int endpoint=max_element(d.begin(),d.end())-d.begin();vector<int>s;for(int p=last[endpoint];p!=-1;p=nodes[p].parent)s.push_back(nodes[p].value);reverse(s.begin(),s.end());cout<<s.size()<<"\n";for(size_t i=0;i<s.size();i++)cout<<(i?" ":"")<<s[i];cout<<"\n";

return 0;
}
