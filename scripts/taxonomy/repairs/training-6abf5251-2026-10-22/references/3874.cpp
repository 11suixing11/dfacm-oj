#include <bits/stdc++.h>
using namespace std;
long double parse(){string s;cin>>s;if(s=="+"||s=="-"||s=="*"||s=="/"){long double a=parse();long double b=parse();if(s=="+")return a+b;if(s=="-")return a-b;if(s=="*")return a*b;return a/b;}return stold(s);}int main(){cout<<fixed<<setprecision(6)<<parse()<<"\n";}
