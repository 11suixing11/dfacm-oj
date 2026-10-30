#include <bits/stdc++.h>
using namespace std;
int main(){string s,q;cin>>s;int r=0;for(char c:s){r=r*10+c-'0';q+=char(r/13+'0');r%=13;}auto p=q.find_first_not_of('0');cout<<(p==string::npos?"0":q.substr(p))<<"\n"<<r<<"\n";}
