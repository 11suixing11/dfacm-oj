#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string s;cin>>s;bool ok=true;for(size_t i=0;i<s.size();i++)if(s[i]!='#'){bool left=2*i+1<s.size()&&s[2*i+1]!='#',right=2*i+2<s.size()&&s[2*i+2]!='#';if(left!=right)ok=false;}cout<<(ok?"Yes":"No")<<"\n";

return 0;
}
