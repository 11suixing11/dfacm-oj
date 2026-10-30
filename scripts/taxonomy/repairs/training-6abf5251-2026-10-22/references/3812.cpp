#include <bits/stdc++.h>
using namespace std;
int main(){string s;getline(cin,s);for(char&c:s)if(c>='a'&&c<='z')c=(c-'a'+1)%26+'a';else if(c>='A'&&c<='Z')c=(c-'A'+1)%26+'A';cout<<s<<"\n";}
