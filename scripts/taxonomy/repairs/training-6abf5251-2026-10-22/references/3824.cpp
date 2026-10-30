#include <bits/stdc++.h>
using namespace std;
int main(){int k;string s;cin>>k>>s;for(size_t i=0;i<s.size();){size_t j=i+1;while(j<s.size()&&s[j]==s[i])j++;if(j-i>=size_t(k)){cout<<s[i]<<"\n";return 0;}i=j;}cout<<"No\n";}
