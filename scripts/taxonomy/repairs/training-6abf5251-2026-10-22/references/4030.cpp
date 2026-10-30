#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

int n;cin>>n;map<char,int>rank={{'<',0},{'(',1},{'[',2},{'{',3}};map<char,char>opening={{'>','<'},{')','('},{']','['},{'}','{'}};while(n--){string s;cin>>s;vector<char>stack;bool ok=true;for(char c:s){if(rank.count(c)){if(!stack.empty()&&rank[c]>rank[stack.back()]){ok=false;break;}stack.push_back(c);}else{if(stack.empty()||stack.back()!=opening[c]){ok=false;break;}stack.pop_back();}}cout<<(ok&&stack.empty()?"YES":"NO")<<"\n";}

return 0;
}
