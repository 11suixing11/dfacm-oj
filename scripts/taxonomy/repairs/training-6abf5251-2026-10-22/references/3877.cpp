#include <bits/stdc++.h>
using namespace std;
int main(){int n,x,f[21]={0,1};for(int i=2;i<=20;i++)f[i]=f[i-1]+f[i-2];cin>>n;while(n--){cin>>x;cout<<f[x]<<"\n";}}
