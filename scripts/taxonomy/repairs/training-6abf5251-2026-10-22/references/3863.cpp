#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;int c[26]={};for(char x:s)c[x-'a']++;int k=max_element(c,c+26)-c;cout<<char('a'+k)<<" "<<c[k]<<"\n";}
