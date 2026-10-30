#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>d(n+1);d[0]=1;for(int coin:{10,20,50,100})for(int j=coin;j<=n;j++)d[j]+=d[j-coin];cout<<(n==0?0:d[n])<<"\n";}
