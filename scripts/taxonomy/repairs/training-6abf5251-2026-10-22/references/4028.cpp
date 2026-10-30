#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string s;cin>>s;int balance=0;bool ok=true;for(char c:s){if(c=='@')break;if(c=='(')balance++;if(c==')')balance--;if(balance<0)ok=false;}cout<<(ok&&!balance?"YES":"NO")<<"\n";

return 0;
}
