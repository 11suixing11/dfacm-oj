#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;while(n--){string s;cin>>s;for(size_t i=0;i<s.size();i++)if(isalpha((unsigned char)s[i]))s[i]=i?tolower(s[i]):toupper(s[i]);cout<<s<<"\n";}}
