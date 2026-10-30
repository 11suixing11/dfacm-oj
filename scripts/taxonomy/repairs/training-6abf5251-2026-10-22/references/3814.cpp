#include <bits/stdc++.h>
using namespace std;
int main(){string s;getline(cin,s);for(char&c:s)if(c>='a'&&c<='z')c-=32;cout<<s<<"\n";}
