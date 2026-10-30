#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;long long f=1,s=0;for(int i=1;i<=n;i++){f*=i;s+=f;}cout<<s<<"\n";}
