#include <bits/stdc++.h>
using namespace std;
int main(){string s;getline(cin,s);for(size_t i=0;i<s.size();i++)cout<<char((unsigned char)s[i]+(unsigned char)s[(i+1)%s.size()]);cout<<"\n";}
