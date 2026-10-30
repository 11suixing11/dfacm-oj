#include <bits/stdc++.h>
using namespace std;
void out(unsigned long long n,int m){if(n>=unsigned(m))out(n/m,m);cout<<"0123456789ABCDEF"[n%m];}int main(){unsigned long long n;int m;cin>>n>>m;out(n,m);cout<<"\n";}
