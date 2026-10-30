#include <bits/stdc++.h>
using namespace std;
int main(){string a,b;cin>>a>>b;if(b.find(a)!=string::npos)cout<<a<<" is substring of "<<b;else if(a.find(b)!=string::npos)cout<<b<<" is substring of "<<a;else cout<<"No substring";cout<<"\n";}
