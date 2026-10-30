#include <bits/stdc++.h>
using namespace std;
string fmt(long double v){if(v==0)v=0;ostringstream out;out<<fixed<<setprecision(5)<<v;string s=out.str();return s=="-0.00000"?"0.00000":s;}
int main(){long double a,b,c;cin>>a>>b>>c;long double d=b*b-4*a*c;if(d<0){cout<<"No answer!\n";return 0;}if(d==0){cout<<"x1=x2="<<fmt(-b/(2*a))<<"\n";return 0;}long double q=-0.5L*(b+copysignl(sqrtl(d),b));long double u=q/a,v=c/q;if(u>v)swap(u,v);cout<<"x1="<<fmt(u)<<";x2="<<fmt(v)<<"\n";}
