#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string inside,level;cin>>inside>>level;function<string(string)>visit=[&](string s){if(s.empty())return string();char root=0;for(char c:level)if(s.find(c)!=string::npos){root=c;break;}int k=s.find(root);return root+visit(s.substr(0,k))+visit(s.substr(k+1));};cout<<visit(inside)<<"\n";

return 0;
}
