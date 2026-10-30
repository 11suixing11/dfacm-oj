#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string s;cin>>s;vector<char>stack;bool ok=true;for(char c:s){if(c=='('||c=='[')stack.push_back(c);else{char opening=c==')'?'(':'[';if(stack.empty()||stack.back()!=opening){ok=false;break;}stack.pop_back();}}cout<<(ok&&stack.empty()?"OK":"Wrong")<<"\n";

return 0;
}
