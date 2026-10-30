#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string pre,inside;cin>>pre>>inside;struct Node{char c;int left=-1,right=-1,len=0;};vector<Node>nodes;function<int(string,string)>build=[&](string p,string s){if(p.empty())return -1;int i=nodes.size(),k=s.find(p[0]);nodes.push_back({p[0]});int l=build(p.substr(1,k),s.substr(0,k)),r=build(p.substr(k+1),s.substr(k+1));nodes[i].left=l;nodes[i].right=r;nodes[i].len=l<0&&r<0?1:(l<0?0:nodes[l].len)+(r<0?0:nodes[r].len);return i;};int root=build(pre,inside);function<void(int)>print=[&](int i){if(i<0)return;cout<<string(nodes[i].len,nodes[i].c)<<"\n";print(nodes[i].left);print(nodes[i].right);};print(root);

return 0;
}
