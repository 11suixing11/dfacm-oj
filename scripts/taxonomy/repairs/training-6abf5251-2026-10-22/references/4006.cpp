#include <bits/stdc++.h>
using namespace std;

string decimal(__int128 x){if(!x)return "0";bool negative=x<0;if(negative)x=-x;string s;while(x){s+=char('0'+x%10);x/=10;}if(negative)s+='-';reverse(s.begin(),s.end());return s;}

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string s;getline(cin,s);vector<__int128>stack;for(size_t i=0;i<s.size();){char c=s[i];if(c=='@')break;if(isspace((unsigned char)c)){i++;continue;}if(isdigit((unsigned char)c)){__int128 x=0;while(i<s.size()&&isdigit((unsigned char)s[i]))x=x*10+s[i++]-'0';stack.push_back(x);}else{__int128 b=stack.back();stack.pop_back();__int128 a=stack.back();stack.pop_back();stack.push_back(c=='+'?a+b:c=='-'?a-b:c=='*'?a*b:a/b);i++;}}cout<<decimal(stack.back())<<"\n";

return 0;
}
