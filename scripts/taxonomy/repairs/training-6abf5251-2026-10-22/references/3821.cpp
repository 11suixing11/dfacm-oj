#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;for(size_t i=0;i<s.size();){size_t j=i+1;while(j<s.size()&&s[j]==s[i])j++;cout<<j-i<<s[i];i=j;}cout<<"\n";}
