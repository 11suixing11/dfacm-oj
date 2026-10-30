#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;long long p=0,q=1;while(n--){long long a,b;char slash;cin>>a>>slash>>b;long long common=gcd(q,b);p=p*(b/common)+a*(q/common);q*=b/common;common=gcd(p,q);p/=common;q/=common;}cout<<p;if(q!=1)cout<<'/'<<q;cout<<"\n";}
