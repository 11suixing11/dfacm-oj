#include <bits/stdc++.h>
using namespace std;
int main(){int n,x,mx=0;cin>>n;vector<int>c(10000);while(n--){cin>>x;c[x]++;mx=max(mx,x);}for(int i=0;i<=mx;i++)cout<<c[i]<<"\n";}
