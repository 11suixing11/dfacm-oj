#include <bits/stdc++.h>
using namespace std;
int main(){long long a,b,c;cin>>a>>b>>c;long long g=gcd(abs(a-b),abs(a-c));if(g==0){cout<<2<<"\n";return 0;}for(long long p=2;p*p<=g;p++)if(g%p==0){cout<<p<<"\n";return 0;}cout<<g<<"\n";}
