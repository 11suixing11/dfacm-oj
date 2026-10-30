#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>d(n+1,LLONG_MAX/4);d[1]=0;for(int i=0;i<n;i++)for(int j=1;j<=n;j++){int x;cin>>x;d[j]=min(d[j],d[j-1])+x;}cout<<d[n]<<"\n";}
