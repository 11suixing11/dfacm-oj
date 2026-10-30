#include <bits/stdc++.h>
using namespace std;

int main(){ios::sync_with_stdio(false);cin.tie(nullptr);

string s;cin>>s;size_t index=0;string inside,post;function<void()>visit=[&](){char ch=s[index++];if(ch=='.')return;visit();inside+=ch;visit();post+=ch;};visit();cout<<inside<<"\n"<<post<<"\n";

return 0;
}
