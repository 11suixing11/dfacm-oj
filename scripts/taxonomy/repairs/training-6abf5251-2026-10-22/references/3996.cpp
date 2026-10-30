#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string digits;int s;cin>>digits>>s;string answer;for(char ch:digits){while(s&&!answer.empty()&&answer.back()>ch){answer.pop_back();s--;}answer+=ch;}if(s)answer.resize(answer.size()-s);auto p=answer.find_first_not_of('0');cout<<(p==string::npos?"0":answer.substr(p))<<"\n";

return 0;
}
