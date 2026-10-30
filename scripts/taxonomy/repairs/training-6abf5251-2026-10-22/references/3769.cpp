#include <bits/stdc++.h>
using namespace std;
int main(){long double x;int n;cin>>x>>n;long double p=1,s=1;for(int i=1;i<=n;i++){p*=x;s+=p;}cout<<fixed<<setprecision(2)<<s<<"\n";}
