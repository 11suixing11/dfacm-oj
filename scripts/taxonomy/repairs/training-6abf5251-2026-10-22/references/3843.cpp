#include <bits/stdc++.h>
using namespace std;
int main(){long double x;int n;cin>>x>>n;long double f=x;for(int i=1;i<=n;i++)f=x/(i+f);cout<<fixed<<setprecision(2)<<f<<"\n";}
