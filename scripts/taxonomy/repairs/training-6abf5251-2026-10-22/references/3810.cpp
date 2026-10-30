#include <bits/stdc++.h>
using namespace std;
int main(){string s;cin>>s;bool ok=!s.empty()&&!isdigit((unsigned char)s[0]);for(unsigned char c:s)ok&=isalpha(c)||isdigit(c)||c=='_';cout<<(ok?"yes":"no")<<"\n";}
