#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;long double f=1,s=1;for(int i=1;i<=n;i++){f*=i;s+=1/f;}cout<<fixed<<setprecision(10)<<s<<"\n";}
