#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

map<string,string>father;string token,current;auto root=[&](string x){while(father[x]!=x)x=father[x];return x;};while(cin>>token&&token!="$"){string name=token.substr(1);if(!father.count(name))father[name]=name;if(token[0]=='#')current=name;else if(token[0]=='+')father[name]=current;else cout<<name<<" "<<root(name)<<"\n";}

return 0;
}
