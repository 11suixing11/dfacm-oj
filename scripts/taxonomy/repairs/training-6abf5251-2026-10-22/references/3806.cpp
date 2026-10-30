#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;int c[26]={};for(char x:s)c[x-'a']++;for(char x:s)if(c[x-'a']==1){cout<<x<<"\n";return 0;}cout<<"no\n";}
