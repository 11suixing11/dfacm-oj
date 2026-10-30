#include <bits/stdc++.h>
using namespace std;
int main(){int n,m;cin>>n>>m;vector<bool>a(n+1,true);for(int k=1;k<=m;k++)for(int j=k;j<=n;j+=k)a[j]=!a[j];bool first=true;for(int i=1;i<=n;i++)if(!a[i]){if(!first)cout<<",";cout<<i;first=false;}cout<<"\n";}
