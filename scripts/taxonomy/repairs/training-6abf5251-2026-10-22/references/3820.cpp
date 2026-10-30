#include <bits/stdc++.h>
using namespace std;
int main(){string s;getline(cin,s);for(size_t i=0;i<s.size();){if(s[i]==' '){i++;continue;}size_t j=s.find(' ',i);if(j==string::npos)j=s.size();reverse(s.begin()+i,s.begin()+j);i=j;}cout<<s<<"\n";}
