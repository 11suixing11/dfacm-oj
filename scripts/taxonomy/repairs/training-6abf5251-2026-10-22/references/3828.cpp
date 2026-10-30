#include <bits/stdc++.h>
using namespace std;
int main(){long double a,b,c;cin>>a>>b>>c;cout<<fixed<<setprecision(3)<<max({a,b,c})/(max({a+b,b,c})*max({a,b,b+c}))<<"\n";}
