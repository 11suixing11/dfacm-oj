#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

vector<array<int,26>>tree(1);string s;while(cin>>s){int node=0;for(char ch:s){int c=ch-'A';if(!tree[node][c]){int next=tree.size();tree[node][c]=next;tree.emplace_back();}node=tree[node][c];}}cout<<tree.size()<<"\n";

return 0;
}
